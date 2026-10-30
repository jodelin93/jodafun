import { Suspense } from 'react';
import AfricanCasino from '../../components/casino/AfricanCasino';

export default function AfricanCasinoPage() {
  // AfricanCasino reads useSearchParams(), which needs a Suspense boundary for static prerendering
  return (
    <Suspense>
      <AfricanCasino />
    </Suspense>
  );
}
