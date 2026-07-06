export interface RewardPopupItem {
    type: unknown;
    amount: number;
    heroId?: number;
}

export interface RewardPopupPayload {
    items: RewardPopupItem[];
    reason?: string;
    source?: string;
}
