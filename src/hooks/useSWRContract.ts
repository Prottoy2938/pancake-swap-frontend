/* eslint-disable no-param-reassign */
import { FetchStatus } from 'config/constants/types'
import { Contract } from 'ethers'
import { FormatTypes } from 'ethers/lib/utils'
import useSWR, { Middleware, SWRConfiguration, KeyedMutator } from 'swr'

declare module 'swr' {
  interface SWRResponse<Data = any, Error = any> {
    data?: Data
    error?: Error
    mutate: KeyedMutator<Data>
    isValidating: boolean
    // Add global fetchStatus to SWRResponse
    status: FetchStatus
  }
}

export const fetchStatusMiddleware: Middleware = (useSWRNext) => {
  return (key, fetcher, config) => {
    const swr = useSWRNext(key, fetcher, config)
    let status = FetchStatus.Idle

    if (!swr.isValidating && !swr.error && !swr.data) {
      status = FetchStatus.Idle
    } else if (swr.isValidating && !swr.error && !swr.data) {
      status = FetchStatus.Fetching
    } else if (swr.data) {
      status = FetchStatus.Fetched
    } else if (swr.error && !swr.data) {
      status = FetchStatus.Failed
    }

    return {
      status,
      ...swr,
    }
  }
}

type MaybeContract<C extends Contract = Contract> = C | null | undefined
type ContractMethodName<C extends Contract = Contract> = keyof C['callStatic'] & string

type ContractMethodParams<
  C extends Contract = Contract,
  N extends ContractMethodName<C> = ContractMethodName<C>,
> = Parameters<C['callStatic'][N]>

type UseSWRContractArrayKey<C extends Contract = Contract, N extends ContractMethodName<C> = any> =
  | [MaybeContract<C>, N, ContractMethodParams<C, N>]
  | [MaybeContract<C>, N]

export type UseSWRContractObjectKey<
  C extends Contract = Contract,
  N extends ContractMethodName<C> = ContractMethodName<C>,
> = {
  contract: MaybeContract<C>
  methodName: N
  params?: ContractMethodParams<C, N>
}

type UseSWRContractSerializeKeys = {
  address: string
  interfaceFormat: string[]
  methodName: string
  callData: string
}

const getContractKey = <T extends Contract = Contract, N extends ContractMethodName<T> = any>(
  key?: UseSWRContractKey<T, N> | null,
) => {
  if (Array.isArray(key)) {
    const [contract, methodName, params] = key || []
    return {
      contract,
      methodName,
      params,
    }
  }
  return key
}

const serializesContractKey = <T extends Contract = Contract>(
  key?: UseSWRContractKey<T> | null,
): UseSWRContractSerializeKeys | null => {
  const { contract, methodName, params } = getContractKey(key) || {}
  const serializedKeys =
    key && contract && methodName
      ? {
          address: contract.address,
          interfaceFormat: contract.interface.format(FormatTypes.full) as string[],
          methodName,
          callData: contract.interface.encodeFunctionData(methodName, params),
        }
      : null
  return serializedKeys
}

type UseSWRContractKey<T extends Contract = Contract, N extends ContractMethodName<T> = any> =
  | UseSWRContractArrayKey<T, N>
  | UseSWRContractObjectKey<T, N>
export function useSWRContract<
  Error = any,
  T extends Contract = Contract,
  N extends ContractMethodName<T> = ContractMethodName<T>,
  // until typescript is upgrade
  Data = any,
  // Data = Awaited<ReturnType<T['functions'][N]>>,
>(key?: UseSWRContractKey<T, N> | null, config: SWRConfiguration<Data, Error> = {}) {
  const { contract, methodName, params } = getContractKey(key) || {}
  const serializedKeys = serializesContractKey(key)

  return useSWR<Data, Error>(
    serializedKeys,
    async () => {
      if (!contract || !methodName) return null
      if (!params) return contract[methodName]()
      return contract[methodName](...params)
    },
    config,
  )
}

export const immutableMiddleware: Middleware = (useSWRNext) => (key, fetcher, config) => {
  config.revalidateOnFocus = false
  config.revalidateIfStale = false
  config.revalidateOnReconnect = false
  return useSWRNext(key, fetcher, config)
}

// dev only
export const loggerMiddleware: Middleware = (useSWRNext) => {
  return (key, fetcher, config) => {
    // Add logger to the original fetcher.
    const extendedFetcher = fetcher
      ? (...args: unknown[]) => {
          console.debug('SWR Request:', key)
          return fetcher(...args)
        }
      : null

    // Execute the hook with the new fetcher.
    return useSWRNext(key, extendedFetcher, config)
  }
}