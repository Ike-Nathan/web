import { Suspense } from 'react'
import ContractsClient from './ContractsClient'
import ContractsSkeleton from '@/components/ContractsSkeleton'

export default function ContractsPage() {
  return (
    <Suspense fallback={<ContractsSkeleton />}>
      <ContractsClient />
    </Suspense>
  )
}