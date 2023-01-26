import { IPaymasterAPI } from '@biconomy-sdk-dev/core-types'

export interface ClientConfig {
  dappAPIKey: string
  socketServerUrl: string
  biconomySigningServiceUrl: string
  customPaymasterAPI?: IPaymasterAPI
  entryPointAddress: string
  bundlerUrl: string
  chainId: number
}
