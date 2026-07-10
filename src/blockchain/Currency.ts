export interface CurrencyConfig {
    name: string;
    symbol: string;
    decimals: number;
    miningReward: number;
    demoGenesisAmount: number;
    initialDifficulty: string;
    targetBlockTimeSeconds: number;
    difficultyAdjustmentInterval: number;
}

export const DEFAULT_CURRENCY: CurrencyConfig = {
    name: "MattiaCoin",
    symbol: "MTC",
    decimals: 0,
    miningReward: 10,
    demoGenesisAmount: 100,
    initialDifficulty: "0000",
    targetBlockTimeSeconds: 10,
    difficultyAdjustmentInterval: 10
};

export function formatCurrencyAmount(amount: number, currency: CurrencyConfig = DEFAULT_CURRENCY): string {
    return `${amount} ${currency.symbol}`;
}
