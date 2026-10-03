export const POST_STATUSES=['draft','publishing','published','failed','cancelled','retracting','retracted','needs_action'] as const;
export type PostStatus=typeof POST_STATUSES[number];
export const EMPTY_APPROVAL={status:'unapproved',contentRevision:null,sourceRevision:null,renditionId:null,approvedAt:null};
export const INVALID_APPROVAL={...EMPTY_APPROVAL,status:'invalidated'};
export const REQUIRED_SCOPES=['instagram_basic','instagram_content_publish','pages_show_list','pages_read_engagement'];
export const DELETE_SCOPES=['instagram_basic','instagram_manage_contents'];
