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
    expect(validateWebhookUrl(url, 'mainnet')).toBe(expected)
  })
})
