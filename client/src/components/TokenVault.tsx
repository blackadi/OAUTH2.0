import { useState } from 'react';
import { jwtDecode, type JwtPayload } from 'jwt-decode';
import { useToken } from '../context/TokenContext';

const TokenVault: React.FC = () => {
  const { tokenSet, clearTokens } = useToken();
  const [decodedIdToken, setDecodedIdToken] = useState<JwtPayload | null>(null);

  const copy = async (val: string | undefined, label: string) => {
    if (!val) return;
    try {
      await navigator.clipboard.writeText(val);
      alert(`${label} copied`);
    } catch { /* ignore */ }
  };

  const decodeIdToken = () => {
    if (!tokenSet?.id_token) return;
    try {
      setDecodedIdToken(jwtDecode(tokenSet.id_token));
    } catch {
      alert('Failed to decode ID token');
    }
  };

  const renderCard = (label: string, value: string | undefined, color: string) => (
    <div className={`vault-card vault-${color}`}>
      <div className="vault-label">{label}</div>
      <div className="vault-value">{value ? `${value.slice(0, 40)}…` : '(empty)'}</div>
      <div className="vault-actions">
        <button disabled={!value} onClick={() => copy(value, label)} className="button small">Copy</button>
        {label === 'ID Token' && (
          <button disabled={!value} onClick={decodeIdToken} className="button small">Decode</button>
        )}
      </div>
    </div>
  );

  return (
    <div className="vault">
      <div className="vault-header">
        <h2>Token Vault</h2>
        {tokenSet && <button onClick={clearTokens} className="button small danger">Clear All</button>}
      </div>
      <div className="vault-cards">
        {renderCard('Access Token', tokenSet?.access_token, 'green')}
        {renderCard('Refresh Token', tokenSet?.refresh_token, 'blue')}
        {renderCard('ID Token', tokenSet?.id_token, 'purple')}
      </div>
      {decodedIdToken && (
        <details className="section" open>
          <summary className="section-summary">Decoded ID Token</summary>
          <pre className="json-block">{JSON.stringify(decodedIdToken, null, 2)}</pre>
        </details>
      )}
    </div>
  );
};

export default TokenVault;
