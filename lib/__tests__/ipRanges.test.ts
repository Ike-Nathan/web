import { classifyHost, stripBrackets } from '../ipRanges'
import { validateWebhookUrl } from '../stellar'

describe('classifyHost', () => {
  it.each([
    // IPv4
    ['127.0.0.1', 'loopback'],
    ['0.0.0.0', 'loopback'],
    ['10.0.0.5', 'private'],
    ['172.16.0.1', 'private'],
    ['192.168.1.1', 'private'],
    ['169.254.169.254', 'linkLocal'],
    ['100.64.0.1', 'private'], // CGNAT 100.64.0.0/10
    ['100.127.255.254', 'private'],
    ['198.18.0.1', 'private'], // benchmarking 198.18.0.0/15
    ['198.19.255.254', 'private'],
    ['192.0.2.1', 'private'], // documentation
    ['224.0.0.1', 'private'], // multicast
    ['255.255.255.255', 'private'],
    ['240.0.0.1', 'private'], // reserved
    ['8.8.8.8', 'public'],
    ['100.128.0.1', 'public'],
    ['198.20.0.1', 'public'],
    // IPv6 (URL.hostname keeps the brackets)
    ['[::1]', 'loopback'],
    ['[::]', 'loopback'],
    ['[::ffff:127.0.0.1]', 'loopback'], // IPv4-mapped
    ['[::ffff:7f00:1]', 'loopback'],
    ['[::ffff:10.0.0.1]', 'private'],
    ['[fc00::1]', 'private'], // unique-local
    ['[fd12:3456::1]', 'private'],
    ['[fe80::1]', 'linkLocal'],
    ['[ff02::1]', 'private'], // multicast
    ['[2001:db8::1]', 'private'], // documentation
    ['[64:ff9b::a00:1]', 'private'], // NAT64 of 10.0.0.1
    ['[2606:4700::1111]', 'public'],
    // names
    ['localhost', 'loopback'],
    ['api.localhost', 'loopback'],
    ['example.com', 'public'],
    ['fdroid.org', 'public'],
  ])('%s -> %s', (host, expected) => {
    expect(classifyHost(host)).toBe(expected)
  })

  it('strips IPv6 brackets', () => {
    expect(stripBrackets('[::1]')).toBe('::1')
    expect(stripBrackets('example.com')).toBe('example.com')
  })
})

describe('validateWebhookUrl uses the shared classifier', () => {
  it.each([
    ['https://[::1]/hook', 'loopback_not_allowed'],
    ['https://[::ffff:127.0.0.1]/hook', 'loopback_not_allowed'],
    ['https://[fc00::1]/hook', 'private_ip_not_allowed'],
    ['https://[fe80::1]/hook', 'link_local_not_allowed'],
    ['https://100.64.0.1/hook', 'private_ip_not_allowed'],
    ['https://198.18.0.1/hook', 'private_ip_not_allowed'],
    ['https://fdroid.org/hook', null],
  ])('%s -> %s', (url, expected) => {
    expect(validateWebhookUrl(url, 'mainnet').code).toBe(expected)
  })

  // Regression: IPv6 range checks must only apply to bracketed IP literals,
  // never to hostnames that merely start with fc/fd/fe80.
  it.each([
    'https://fcbarcelona.com/hook',
    'https://fd-alerts.example.com/hook',
    'https://fe80labs.io/hook',
    'https://fc00.example.com/hook',
  ])('accepts the public hostname %s', (url) => {
    expect(validateWebhookUrl(url, 'mainnet')).toMatchObject({
      valid: true,
      code: null,
    })
  })

  // The most severe problem wins: a blocked address beats a plain-http
  // warning or the mainnet http error.
  it.each([
    ['http://localhost/hook', 'testnet', 'loopback_not_allowed'],
    ['http://localhost/hook', 'mainnet', 'loopback_not_allowed'],
    ['http://127.0.0.1/hook', 'testnet', 'loopback_not_allowed'],
    ['http://[::1]/hook', 'testnet', 'loopback_not_allowed'],
    ['http://[fd00::1]/hook', 'testnet', 'private_ip_not_allowed'],
    ['http://10.0.0.5/hook', 'mainnet', 'private_ip_not_allowed'],
    ['http://[fe80::1]/hook', 'testnet', 'link_local_not_allowed'],
    ['http://user:pass@localhost/hook', 'testnet', 'credentials_in_url'],
  ] as const)('%s on %s -> %s', (url, network, expected) => {
    const result = validateWebhookUrl(url, network)
    expect(result.code).toBe(expected)
    expect(result.valid).toBe(false)
  })

  it('still warns (not blocks) on plain http to a public host on testnet', () => {
    expect(
      validateWebhookUrl('http://example.com/hook', 'testnet')
    ).toMatchObject({
      valid: true,
      code: 'http_warning',
      warning: true,
    })
  })
})
