import { sha256 } from "../crypto/hash.js";

export type UTXOInput = {
    txId: string;
    index: number;
    signature: string;
    publicKey: string;
};

export type UTXOOutput = {
    index: number;
    owner: string;
    amount: number;
};

export class Transaction {

    id: string;

    inputs: UTXOInput[];
    outputs: UTXOOutput[];

    constructor(
        inputs: UTXOInput[],
        outputs: UTXOOutput[]
    ) {
        this.inputs = inputs;
        this.outputs = outputs;

        this.id = this.calculateHash();
    }

    private getSerializableInputs(): Array<Omit<UTXOInput, "signature">> {
        return this.inputs.map(({ txId, index, publicKey }) => ({
            txId,
            index,
            publicKey
        }));
    }

    calculateHash(): string {
        return sha256(
            JSON.stringify(this.getSerializableInputs()) +
            JSON.stringify(this.outputs)
        );
    }

    getSigningData(): string {
        return this.calculateHash();
    }

}