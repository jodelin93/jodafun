import { Suspense } from 'react';
import Dominoes from '../../components/dominoes/Dominoes';

export default function DominoesPage() {
  // Dominoes reads useSearchParams(), which needs a Suspense boundary for static prerendering
  return (
    <Suspense>
      <Dominoes />
    </Suspense>
  );
}
