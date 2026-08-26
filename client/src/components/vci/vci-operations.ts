/**
 * The nine VCI operations, their three groups, and the flow they belong to.
 *
 * Extracted from a 561-line section so the three groups can live in three files — one per
 * **authentication posture**. Discovery is public, Offers are admin-gated, and the Credential
 * endpoints take an access token; getting that category wrong is how
 * `POST /api/vci/deferred/issue` came to authenticate nobody while its two siblings on the same router
 * answered `401`.
 */
export type VciOp =
  | 'metadata'
  | 'jwtissuer'
  | 'jwks'
  | 'wellknown'
  | 'offer-create'
  | 'offer-info'
  | 'cred-issue'
  | 'cred-batch'
  | 'deferred-issue';

/** Every value `VciOp` can take, as a runtime list — the allowed set for the URL parameter. */
export const ALL_OPS = [
  'metadata',
  'jwtissuer',
  'jwks',
  'wellknown',
  'offer-create',
  'offer-info',
  'cred-issue',
  'cred-batch',
  'deferred-issue',
] as const satisfies readonly VciOp[];

export const VCI_OPS: { value: VciOp; label: string; group: string }[] = [
  { value: 'metadata', label: 'Metadata', group: 'Discovery' },
  { value: 'jwtissuer', label: 'JWT Issuer', group: 'Discovery' },
  { value: 'jwks', label: 'JWKS', group: 'Discovery' },
  { value: 'wellknown', label: 'Well-Known', group: 'Discovery' },
  { value: 'offer-create', label: 'Create Offer', group: 'Offers' },
  { value: 'offer-info', label: 'Get Offer Info', group: 'Offers' },
  { value: 'cred-issue', label: 'Issue', group: 'Credential' },
  { value: 'cred-batch', label: 'Batch', group: 'Credential' },
  { value: 'deferred-issue', label: 'Deferred', group: 'Credential' },
];

export const GROUPS = ['Discovery', 'Offers', 'Credential'];

export const VC_STEPS = [
  { id: 'discover', label: 'Discover' },
  { id: 'offer', label: 'Create Offer' },
  { id: 'token', label: 'Get Token' },
  { id: 'issue', label: 'Issue' },
];

export function toOpGroup(op: VciOp): string {
  if (['metadata', 'jwtissuer', 'jwks', 'wellknown'].includes(op)) return 'discover';
  if (['offer-create', 'offer-info'].includes(op)) return 'offer';
  return 'issue';
}
