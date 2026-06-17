import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { NavigationInstruction } from '@/components/NavigationInstruction';

describe('NavigationInstruction', () => {
    it('n\'affiche rien si instruction est null', () => {
        const { toJSON } = render(<NavigationInstruction instruction={null} />);
        expect(toJSON()).toBeNull();
    });

    it('affiche le texte de l\'instruction', () => {
        render(<NavigationInstruction instruction={{ instruction: 'Tournez à gauche', distance: 0.3 }} />);
        expect(screen.getByText('Tournez à gauche')).toBeTruthy();
    });

    it('affiche la distance en mètres quand < 1 km', () => {
        render(<NavigationInstruction instruction={{ instruction: 'Tournez à droite', distance: 0.35 }} />);
        expect(screen.getByText(' 350m')).toBeTruthy();
    });

    it('affiche la distance en km quand >= 1 km', () => {
        render(<NavigationInstruction instruction={{ instruction: 'Continuez tout droit', distance: 2.5 }} />);
        expect(screen.getByText(' 2.5km')).toBeTruthy();
    });

    it('affiche exactement 1.0km pour une distance de 1 km', () => {
        render(<NavigationInstruction instruction={{ instruction: 'Continuez tout droit', distance: 1.0 }} />);
        expect(screen.getByText(' 1.0km')).toBeTruthy();
    });

    it('arrondit les mètres à l\'entier le plus proche', () => {
        render(<NavigationInstruction instruction={{ instruction: 'Tournez à gauche', distance: 0.2567 }} />);
        expect(screen.getByText(' 257m')).toBeTruthy();
    });
});
