import { Contract } from 'ethers'

// review // rename to SmartAccountFactoryAPI
export class WalletFactoryAPI {
  static deployWalletTransactionCallData(
    factoryAddress: string,
    owner: string,
    index: number
  ): string {
    // these would be deployCounterfactualWallet
    const factory = new Contract(factoryAddress, [
      'function deployCounterFactualWallet(address _owner, uint _index) returns(address)'
    ])
    const encodedData = factory.interface.encodeFunctionData('deployCounterFactualWallet', [
      owner,
      index
    ])
    return encodedData
  }
}
