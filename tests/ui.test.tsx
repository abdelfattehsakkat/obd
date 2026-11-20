// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { act } from 'react';
import App from '../src/App';

/** Sélectionne le banc virtuel puis lance la connexion. */
async function connectDemo() {
  const select = screen.getByLabelText('Type de connexion') as HTMLSelectElement;
  expect(select.value).toBe('demo');

  const connectButton = screen.getByRole('button', { name: /Connecter/i });
  await act(async () => {
    connectButton.click();
  });

  await waitFor(
    () => {
      expect(screen.getByText('En ligne')).toBeTruthy();
    },
    { timeout: 10000 },
  );
}

describe('interface OBD Scope', () => {
  it('affiche l’écran d’accueil avec le bandeau lecture seule', () => {
    render(<App />);
    expect(screen.getByText('LECTURE SEULE')).toBeTruthy();
    expect(screen.getByText('Démarrer une session de diagnostic')).toBeTruthy();
    expect(screen.getByText('Déconnecté')).toBeTruthy();
  });

  it('se connecte au banc virtuel et affiche des données temps réel', async () => {
    render(<App />);
    await connectDemo();

    // Le VIN remonte dans la barre de statut et le panneau d'identification.
    await waitFor(() => {
      expect(screen.getAllByText('VF1RFA00567123456').length).toBeGreaterThan(0);
    });

    // Les jauges doivent afficher des valeurs numériques, pas des tirets.
    await waitFor(
      () => {
        const gauge = document.querySelector('.gauge');
        expect(gauge).toBeTruthy();
        const value = gauge!.querySelector('.gauge-value')!.textContent ?? '';
        expect(value).not.toBe('—');
        expect(Number.parseFloat(value)).toBeGreaterThan(0);
      },
      { timeout: 10000 },
    );

    expect(screen.getAllByText(/ISO 15765-4/).length).toBeGreaterThan(0);
  }, 20000);

  it('liste les capteurs supportés et permet de basculer l’acquisition', async () => {
    render(<App />);
    await connectDemo();

    await act(async () => {
      screen.getByRole('button', { name: /Données temps réel/i }).click();
    });

    expect(screen.getByText('Données temps réel — mode 01')).toBeTruthy();
    const rpmCheckbox = screen.getByLabelText('Acquérir Régime moteur') as HTMLInputElement;
    expect(rpmCheckbox.checked).toBe(true);

    await act(async () => {
      rpmCheckbox.click();
    });
    expect((screen.getByLabelText('Acquérir Régime moteur') as HTMLInputElement).checked).toBe(
      false,
    );
  }, 20000);

  it('lit et affiche les codes défauts du véhicule simulé', async () => {
    render(<App />);
    await connectDemo();

    await act(async () => {
      screen.getByRole('button', { name: /Codes défauts/i }).click();
    });

    await act(async () => {
      screen.getByRole('button', { name: /Lancer l’analyse/i }).click();
    });

    await waitFor(
      () => {
        expect(screen.getByText('P0301')).toBeTruthy();
        // P0420 est remonté à la fois en « confirmé » et en « permanent ».
        expect(screen.getAllByText('P0420').length).toBe(2);
        expect(screen.getByText('P0171')).toBeTruthy();
      },
      { timeout: 10000 },
    );

    expect(screen.getByText(/Ratés de combustion — cylindre 1/)).toBeTruthy();
  }, 20000);

  it('bloque visuellement une commande d’écriture dans la console', async () => {
    render(<App />);
    await connectDemo();

    await act(async () => {
      screen.getByRole('button', { name: /Console/i }).click();
    });

    const input = screen.getByPlaceholderText(/Commande experte/i) as HTMLInputElement;

    await act(async () => {
      fireEvent.change(input, { target: { value: '04' } });
    });

    await waitFor(() => {
      expect(screen.getByText('Bloqué')).toBeTruthy();
      expect(screen.getByText(/Commande refusée/)).toBeTruthy();
    });

    const sendButton = screen.getByRole('button', { name: /Envoyer/i }) as HTMLButtonElement;
    expect(sendButton.disabled).toBe(true);

    await act(async () => {
      fireEvent.change(input, { target: { value: '010C' } });
    });

    await waitFor(() => {
      expect(screen.getByText('Lecture')).toBeTruthy();
    });
    expect((screen.getByRole('button', { name: /Envoyer/i }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  }, 20000);

  it('journalise les échanges dans la console', async () => {
    render(<App />);
    await connectDemo();

    await act(async () => {
      screen.getByRole('button', { name: /Console/i }).click();
    });

    await waitFor(
      () => {
        const terminal = document.querySelector('.terminal')!;
        expect(within(terminal as HTMLElement).getAllByText(/ATZ|010C/).length).toBeGreaterThan(0);
      },
      { timeout: 10000 },
    );
  }, 20000);
});
