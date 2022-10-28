import { TransactionRequest, TransactionResponse } from '@ethersproject/providers'
import { Signer as AbstractSigner, ethers } from 'ethers'
import { Relayer } from '.'

import {
  RelayTransaction,
  DeployWallet,
  RestRelayerOptions,
  FeeOptionsResponse,
  RelayResponse,
  GasLimit
} from '@biconomy-sdk/core-types'
import { MetaTransaction, encodeMultiSend } from './utils/multisend'
import { HttpMethod, sendRequest } from './utils/httpRequests'
import { ClientMessenger } from 'gasless-messaging-sdk';

/**
 * Relayer class that would be used via REST API to execute transactions
 */
export class RestRelayer implements Relayer {
  #relayServiceBaseUrl: string

  relayerNodeEthersProvider: ethers.providers.JsonRpcProvider;

  constructor(options: RestRelayerOptions) {
    const { url } = options
    this.#relayServiceBaseUrl = url
    this.relayerNodeEthersProvider = new ethers.providers.JsonRpcProvider(url);
  }

  // TODO
  // Review function arguments and return values
  // Defines a type that takes config, context for SCW in play along with other details
  // async deployWallet(deployWallet: DeployWallet): Promise<TransactionResponse> {
  //   // Should check if already deployed
  //   //Review for index and ownership transfer case
  //   const { config, context, index = 0 } = deployWallet
  //   const { address } = config
  //   const { walletFactory } = context
  //   const isExist = await walletFactory.isWalletExist(address)
  //   if (isExist) {
  //     throw new Error('Smart Account is Already Deployed')
  //   }
  //   const walletDeployTxn = this.prepareWalletDeploy(deployWallet)
  //   // REST API call to relayer
  //   return sendRequest({
  //     url: `${this.#relayServiceBaseUrl}`,
  //     method: HttpMethod.Post,
  //     body: { ...walletDeployTxn, gasLimit: ethers.constants.Two.pow(24) }
  //   })
  // }

  prepareWalletDeploy(
    // owner, entryPoint, handler, index
    deployWallet: DeployWallet
    // context: WalletContext
  ): { to: string; data: string } {
    const { config, context, index = 0 } = deployWallet
    const { walletFactory } = context
    const { owner, entryPointAddress, fallbackHandlerAddress } = config
    const factoryInterface = walletFactory.getInterface()

    return {
      to: walletFactory.getAddress(), // from context
      data: factoryInterface.encodeFunctionData(
        factoryInterface.getFunction('deployCounterFactualWallet'),
        [owner, entryPointAddress, fallbackHandlerAddress, index]
      )
    }
  }

  // Make gas limit a param
  // We would send manual gas limit with high targetTxGas (whenever targetTxGas can't be accurately estimated)

  async relay(relayTransaction: RelayTransaction): Promise<RelayResponse> {
    const { config, signedTx, context, gasLimit } = relayTransaction
    const { isDeployed, address } = config
    const { multiSendCall } = context // multisend has to be multiSendCallOnly here!
    if (!isDeployed) {
      const prepareWalletDeploy: DeployWallet = {
        config,
        context,
        index: 0
      }
      const { to, data } = this.prepareWalletDeploy(prepareWalletDeploy)

      const txs: MetaTransaction[] = [
        {
          to,
          value: 0,
          data,
          operation: 0
        },
        {
          to: address,
          value: 0,
          data: signedTx.rawTx.data || '',
          operation: 0
        }
      ]

      const txnData = multiSendCall
        .getInterface()
        .encodeFunctionData('multiSend', [encodeMultiSend(txs)])

      const finalRawRx = {
        to: multiSendCall.getAddress(),
        data: txnData,
        chainId: signedTx.rawTx.chainId,
        value: 0
      }
      console.log('finaRawTx')
      console.log(finalRawRx)

      // JSON RPC Call
      // rawTx to becomes multiSend address and data gets prepared again 
      const response =  await this.relayerNodeEthersProvider
      .send('eth_sendSmartContractWalletTransaction', [{ ...signedTx.rawTx, gasLimit: (gasLimit as GasLimit).hex, refundInfo: {
        tokenGasPrice: signedTx.tx.gasPrice,
        gasToken: signedTx.tx.gasToken,
        } 
      }]);
      const clientMessenger = new ClientMessenger(
        'websocketUrl',
      );
      if (!clientMessenger.socketClient.isConnected()) {
        await clientMessenger.connect();
      }

      clientMessenger.createTransactionNotifier(response.transactionId, {
        onMined: (tx:any) => {
          const txId = tx.transactionId;
          clientMessenger.unsubscribe(txId);
          console.log(`Tx Hash mined message received at client ${JSON.stringify({
            id: txId,
            hash: tx.transactionHash,
            receipt: tx.receipt,
          })}`);
        },
        onHashGenerated: async (tx:any) => {
          const txHash = tx.transactionHash;
          const txId = tx.transactionId;
          console.log(`Tx Hash generated message received at client ${JSON.stringify({
            id: txId,
            hash: txHash,
          })}`);

          console.log(`Receive time for transaction id ${txId}: ${Date.now()}`);
          return {
            transactionId: txId,
            txHash,
          }
        },
        onError: async (tx:any) => {
          const err = tx.error;
          const txId = tx.transactionId;
          console.log(`Error message received at client is ${err}`);
          clientMessenger.unsubscribe(txId);

          return {
            transactionId: txId,
            error: err,
          }
        },
      });
   }
  
    console.log('signedTx', signedTx)
    // JSON RPC Call
    return await this.relayerNodeEthersProvider
    .send('eth_sendSmartContractWalletTransaction', [{ ...signedTx.rawTx, gasLimit: '0x1E8480', refundInfo: {
      tokenGasPrice: signedTx.tx.gasPrice,
      gasToken: signedTx.tx.gasToken,
      } 
    }])
  }

  async getFeeOptions(chainId: number): Promise<FeeOptionsResponse> {
    return sendRequest({
      url: `${this.#relayServiceBaseUrl}/feeOptions?chainId=${chainId}`,
      method: HttpMethod.Get
    })
  }
}
