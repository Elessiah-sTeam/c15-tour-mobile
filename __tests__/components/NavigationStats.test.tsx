import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { NavigationStats } from '@/components/NavigationStats';

const defaultProps = {
    speed: 0,
    remainingDistance: 10,
    estimatedTime: 0,
    isRecalculating: false,
};

describe('NavigationStats', () => {
    describe('affichage du temps en hh:mm', () => {
        it('affiche 0:00 pour 0 minutes', () => {
            render(<NavigationStats {...defaultProps} estimatedTime={0} />);
            expect(screen.getByText('0:00')).toBeTruthy();
        });

        it('affiche 0:05 pour 5 minutes', () => {
            render(<NavigationStats {...defaultProps} estimatedTime={5} />);
            expect(screen.getByText('0:05')).toBeTruthy();
        });

        it('affiche 1:30 pour 90 minutes', () => {
            render(<NavigationStats {...defaultProps} estimatedTime={90} />);
            expect(screen.getByText('1:30')).toBeTruthy();
        });

        it('affiche 2:00 pour 120 minutes', () => {
            render(<NavigationStats {...defaultProps} estimatedTime={120} />);
            expect(screen.getByText('2:00')).toBeTruthy();
        });

        it('padde les minutes avec un zéro (1:05 pour 65 min)', () => {
            render(<NavigationStats {...defaultProps} estimatedTime={65} />);
            expect(screen.getByText('1:05')).toBeTruthy();
        });
    });

    describe('affichage de la vitesse', () => {
        it('affiche la vitesse courante', () => {
            render(<NavigationStats {...defaultProps} speed={80} />);
            expect(screen.getByText('80')).toBeTruthy();
        });
    });

    describe('affichage de la distance', () => {
        it('affiche en km pour distance > 1 km', () => {
            render(<NavigationStats {...defaultProps} remainingDistance={5.3} />);
            expect(screen.getByText('5.3')).toBeTruthy();
            expect(screen.getByText('km')).toBeTruthy();
        });

        it('affiche en mètres pour distance < 1 km', () => {
            render(<NavigationStats {...defaultProps} remainingDistance={0.35} />);
            expect(screen.getByText('350')).toBeTruthy();
            expect(screen.getByText('m')).toBeTruthy();
        });
    });

    describe('état recalcul', () => {
        it('affiche le loader quand isRecalculating est true', () => {
            render(<NavigationStats {...defaultProps} isRecalculating={true} />);
            expect(screen.getByText('Recalcul du trajet...')).toBeTruthy();
        });

        it('n\'affiche pas le loader quand isRecalculating est false', () => {
            render(<NavigationStats {...defaultProps} isRecalculating={false} />);
            expect(screen.queryByText('Recalcul du trajet...')).toBeNull();
        });
    });
});
