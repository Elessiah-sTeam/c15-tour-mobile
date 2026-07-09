import React from 'react';
import { render, screen, act } from '@testing-library/react-native';
import { AudioNotificationBanner } from '@/components/AudioNotificationBanner';

jest.useFakeTimers();

describe('AudioNotificationBanner', () => {
    it('n\'affiche rien quand visible=false', () => {
        const { toJSON } = render(
            <AudioNotificationBanner visible={false} onHide={jest.fn()} />
        );
        expect(toJSON()).toBeNull();
    });

    it('affiche le message quand visible=true', () => {
        render(<AudioNotificationBanner visible={true} onHide={jest.fn()} />);
        expect(screen.getByText("Message audio de l'organisateur")).toBeTruthy();
    });

    it('appelle onHide après 3500ms', () => {
        const onHide = jest.fn();
        render(<AudioNotificationBanner visible={true} onHide={onHide} />);

        act(() => {
            jest.advanceTimersByTime(3500 + 300 + 50); // délai + animation + marge
        });

        expect(onHide).toHaveBeenCalledTimes(1);
    });

    it('n\'appelle pas onHide avant le délai', () => {
        const onHide = jest.fn();
        render(<AudioNotificationBanner visible={true} onHide={onHide} />);

        act(() => {
            jest.advanceTimersByTime(2000);
        });

        expect(onHide).not.toHaveBeenCalled();
    });
});
