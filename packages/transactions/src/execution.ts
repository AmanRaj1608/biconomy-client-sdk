import {
    Contract,
    Wallet,
    utils,
    BigNumber,
    BigNumberish,
    Signer,
    PopulatedTransaction,
} from "ethers";

import { TypedDataSigner } from "@ethersproject/abstract-signer";
import { AddressZero } from "@ethersproject/constants";

// TODO
// Review all types and their placement and dependency
export const EIP_DOMAIN = {
    EIP712Domain: [
        { type: "uint256", name: "chainId" },
        { type: "address", name: "verifyingContract" },
    ],
};

export const EIP712_WALLET_TX_TYPE = {
    // "WalletTx(address to,uint256 value,bytes data,uint8 operation,uint256 targetTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)"
    WalletTx: [
        { type: "address", name: "to" },
        { type: "uint256", name: "value" },
        { type: "bytes", name: "data" },
        { type: "uint8", name: "operation" },
        { type: "uint256", name: "targetTxGas" },
        { type: "uint256", name: "baseGas" },
        { type: "uint256", name: "gasPrice" },
        { type: "address", name: "gasToken" },
        { type: "address", name: "refundReceiver" },
        { type: "uint256", name: "nonce" },
    ],
};

export const EIP712_SMART_ACCOUNT_MESSAGE_TYPE = {
    // "SmartAccountMessage(bytes message)"
    SmartAccountMessage: [{ type: "bytes", name: "message" }],
};

export interface MetaTransaction {
    to: string;
    value: string | number | BigNumber;
    data: string;
    operation: number;
}

// Marked for deletion
export interface SmartaccountTransaction extends MetaTransaction {
    targetTxGas: string | number;
    baseGas: string | number;
    gasPrice: string | number;
    gasToken: string;
    refundReceiver: string;
    nonce: string | number;
}

export interface Transaction {
    to: string;
    value: string | number | BigNumber;
    data: string;
    operation: number;
    targetTxGas: string | number;
}

export interface FeeRefund {
    baseGas: string | number;
    gasPrice: string | number;
    gasToken: string;
    refundReceiver: string;
}

export interface WalletTransaction {
    to: string;
    value: BigNumberish;
    data: string;
    operation: number;
    targetTxGas: string | number; 
    baseGas: string | number;
    gasPrice: string | number;
    gasToken: string;
    refundReceiver: string;
    nonce: number
}

export interface ExecTransaction {
    to: string;
    value: BigNumberish;
    data: string;
    operation: number;
    targetTxGas: string | number;
};

export interface SmartAccountTransaction {
    _tx: ExecTransaction;
    refundInfo: FeeRefund;
    batchId: number;
    nonce: string | number;
};

export interface SmartAccountSignature {
    signer: string;
    data: string;
  }

export const calculateSmartAccountDomainSeparator = (
    wallet: Contract,
    chainId: BigNumberish
): string => {
    return utils._TypedDataEncoder.hashDomain({
        verifyingContract: wallet.address,
        chainId,
    });
};

export const preimageWalletTransactionHash = (
    wallet: Contract,
    SmartAccountTx: WalletTransaction,
    chainId: BigNumberish
): string => {
    return utils._TypedDataEncoder.encode(
        { verifyingContract: wallet.address, chainId },
        EIP712_WALLET_TX_TYPE,
        SmartAccountTx
    );
};

export const calculateSmartAccountTransactionHash = (
    wallet: Contract,
    SmartAccountTx: WalletTransaction,
    chainId: BigNumberish
): string => {
    return utils._TypedDataEncoder.hash(
        { verifyingContract: wallet.address, chainId },
        EIP712_WALLET_TX_TYPE,
        SmartAccountTx
    );
};

export const calculateSmartAccountMessageHash = (
    wallet: Contract,
    message: string,
    chainId: BigNumberish
): string => {
    return utils._TypedDataEncoder.hash(
        { verifyingContract: wallet.address, chainId },
        EIP712_SMART_ACCOUNT_MESSAGE_TYPE,
        { message }
    );
};

export const smartAccountSignTypedData = async (
    signer: Signer & TypedDataSigner,
    wallet: Contract,
    SmartAccountTx: WalletTransaction,
    chainId?: BigNumberish
): Promise<SmartAccountSignature> => {
    if (!chainId && !signer.provider)
        throw Error("Provider required to retrieve chainId");
    const cid = chainId || (await signer.provider!!.getNetwork()).chainId;
    const signerAddress = await signer.getAddress();
    return {
        signer: signerAddress,
        data: await signer._signTypedData(
            { verifyingContract: wallet.address, chainId: cid },
            EIP712_WALLET_TX_TYPE,
            SmartAccountTx
        ),
    };
};

export const signHash = async (
    signer: Signer,
    hash: string
): Promise<SmartAccountSignature> => {
    const typedDataHash = utils.arrayify(hash);
    const signerAddress = await signer.getAddress();
    return {
        signer: signerAddress,
        data: (await signer.signMessage(typedDataHash))
            .replace(/1b$/, "1f")
            .replace(/1c$/, "20"),
    };
};

export const smartAccountSignMessage = async (
    signer: Signer,
    wallet: Contract,
    SmartAccountTx: WalletTransaction,
    chainId?: BigNumberish
): Promise<SmartAccountSignature> => {
    const cid = chainId || (await signer.provider!!.getNetwork()).chainId;
    return signHash(signer, calculateSmartAccountTransactionHash(wallet, SmartAccountTx, cid));
};

export const buildSignatureBytes = (signatures: SmartAccountSignature[]): string => {
    signatures.sort((left, right) =>
        left.signer.toLowerCase().localeCompare(right.signer.toLowerCase())
    );
    let signatureBytes = "0x";
    for (const sig of signatures) {
        signatureBytes += sig.data.slice(2);
    }
    return signatureBytes;
};

export const executeTx = async (
    wallet: Contract,
    SmartAccountTx: WalletTransaction,
    signatures: SmartAccountSignature[],
    overrides?: any
): Promise<any> => {
    const signatureBytes = buildSignatureBytes(signatures);
    const transaction: ExecTransaction = {
        to: SmartAccountTx.to,
        value: SmartAccountTx.value,
        data: SmartAccountTx.data,
        operation: SmartAccountTx.operation,
        targetTxGas: SmartAccountTx.targetTxGas,
    };
    const refundInfo: FeeRefund = {
        baseGas: SmartAccountTx.baseGas,
        gasPrice: SmartAccountTx.gasPrice,
        gasToken: SmartAccountTx.gasToken,
        refundReceiver: SmartAccountTx.refundReceiver,
    };
    return wallet.execTransaction(
        transaction,
        0, // batchId
        refundInfo,
        signatureBytes,
        overrides || {}
    );
};

export const populateExecuteTx = async (
    wallet: Contract,
    SmartAccountTx: WalletTransaction,
    signatures: SmartAccountSignature[],
    overrides?: any
): Promise<PopulatedTransaction> => {
    const signatureBytes = buildSignatureBytes(signatures);
    const transaction: ExecTransaction = {
        to: SmartAccountTx.to,
        value: SmartAccountTx.value,
        data: SmartAccountTx.data,
        operation: SmartAccountTx.operation,
        targetTxGas: SmartAccountTx.targetTxGas,
    };
    const refundInfo: FeeRefund = {
        baseGas: SmartAccountTx.baseGas,
        gasPrice: SmartAccountTx.gasPrice,
        gasToken: SmartAccountTx.gasToken,
        refundReceiver: SmartAccountTx.refundReceiver,
    };
    return wallet.populateTransaction.execTransaction(
        transaction,
        0, // batchId
        refundInfo,
        signatureBytes,
        overrides || {}
    );
};

export const buildContractCall = (
    contract: Contract,
    method: string,
    params: any[],
    nonce: number,
    delegateCall?: boolean,
    overrides?: Partial<WalletTransaction>
): WalletTransaction => {
    const data = contract.interface.encodeFunctionData(method, params);
    return buildSmartAccountTransaction(
        Object.assign(
            {
                to: contract.address,
                data,
                operation: delegateCall ? 1 : 0,
                nonce,
            },
            overrides
        )
    );
};

export const executeTxWithSigners = async (
    wallet: Contract,
    tx: WalletTransaction,
    signers: Wallet[],
    overrides?: any
) => {
    const sigs = await Promise.all(
        signers.map((signer) => smartAccountSignTypedData(signer, wallet, tx))
    );
    return executeTx(wallet, tx, sigs, overrides);
};

export const executeContractCallWithSigners = async (
    wallet: Contract,
    contract: Contract,
    method: string,
    params: any[],
    signers: Wallet[],
    delegateCall?: boolean,
    overrides?: Partial<WalletTransaction>
) => {
    const tx = buildContractCall(
        contract,
        method,
        params,
        await wallet.getNonce(0), //default batchId @review
        delegateCall,
        overrides
    );
    return executeTxWithSigners(wallet, tx, signers);
};

export const buildSmartAccountTransaction = (template: {
    to: string;
    value?: BigNumberish;
    data?: string;
    operation?: number;
    targetTxGas?: number | string;
    baseGas?: number | string;
    gasPrice?: number | string;
    gasToken?: string;
    refundReceiver?: string;
    nonce: number;
}): WalletTransaction => {
    return {
        to: template.to,
        value: template.value || 0,
        data: template.data || "0x",
        operation: template.operation || 0,
        targetTxGas: template.targetTxGas || 0,
        baseGas: template.baseGas || 0,
        gasPrice: template.gasPrice || 0,
        gasToken: template.gasToken || AddressZero,
        refundReceiver: template.refundReceiver || AddressZero,
        nonce: template.nonce,
    };
};

