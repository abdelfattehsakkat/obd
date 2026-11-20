import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Active le mode « act » de React pour que les mises à jour asynchrones
// déclenchées par la session OBD soient correctement encadrées.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  cleanup();
});
