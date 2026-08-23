import { vciService } from '@/services';
import { Button } from '@/components/ui/Button';

/**
 * The four discovery lookups, as data.
 *
 * All four were the same eight lines of JSX differing in an endpoint path, a sentence, a button label
 * and which `vciService` function to call. They are public `GET`s — OID4VCI issuer metadata is
 * discovery, so a credential here would be the bug in the other direction.
 */
const DISCOVERY: {
  op: string;
  endpoint: string;
  blurb: string;
  buttonLabel: string;
  run: () => Promise<unknown>;
}[] = [
  {
    op: 'metadata',
    endpoint: 'GET /api/vci/metadata',
    blurb: 'Returns the credential issuer metadata including supported credential configurations.',
    buttonLabel: 'Fetch Metadata',
    run: () => vciService.getMetadata(),
  },
  {
    op: 'jwtissuer',
    endpoint: 'GET /api/vci/jwtissuer',
    blurb: 'Returns JWT VC issuer metadata (issuer identifier + JWKS URI).',
    buttonLabel: 'Fetch JWT Issuer',
    run: () => vciService.getJwtIssuer(),
  },
  {
    op: 'jwks',
    endpoint: 'GET /api/vci/jwks',
    blurb: 'Returns the public keys used to sign verifiable credentials.',
    buttonLabel: 'Fetch JWKS',
    run: () => vciService.getJwks(),
  },
  {
    op: 'wellknown',
    endpoint: 'GET /api/vci/well-known',
    blurb:
      'Same as Metadata, but served at the OID4VCI-specified well-known path (convenience alias).',
    buttonLabel: 'Fetch Well-Known',
    run: () => vciService.getWellKnown(),
  },
];

export function isDiscoveryOp(op: string): boolean {
  return DISCOVERY.some((d) => d.op === op);
}

export function VciDiscoveryPanel({
  op,
  loading,
  onRun,
}: {
  op: string;
  loading: boolean;
  onRun: (run: () => Promise<unknown>) => void;
}) {
  const entry = DISCOVERY.find((d) => d.op === op);
  if (!entry) return null;
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{entry.endpoint}</p>
      <p className="text-xs text-muted-foreground">{entry.blurb}</p>
      <Button onClick={() => onRun(entry.run)} loading={loading}>
        {entry.buttonLabel}
      </Button>
    </div>
  );
}
