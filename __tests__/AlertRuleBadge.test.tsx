import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AlertRuleBadge from '../components/AlertRuleBadge';

describe('AlertRuleBadge', () => {
  describe('known rule type', () => {
    it('renders the label for a known rule type', () => {
      render(<AlertRuleBadge type="threshold" />);
      expect(screen.getByText(/threshold/i)).toBeInTheDocument();
    });

    it('shows the tooltip on hover', () => {
      render(<AlertRuleBadge type="threshold" />);
      const button = screen.getByRole('button');
      fireEvent.mouseEnter(button);
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
    });

    it('shows the tooltip on focus', () => {
      render(<AlertRuleBadge type="threshold" />);
      const button = screen.getByRole('button');
      fireEvent.focus(button);
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
    });
  });

  describe('unknown rule type', () => {
    it('renders the raw type string as the label', () => {
      render(<AlertRuleBadge type="mystery-type" />);
      expect(screen.getByText('mystery-type')).toBeInTheDocument();
    });

    it('renders the unknown rule type description', () => {
      render(<AlertRuleBadge type="mystery-type" />);
      const button = screen.getByRole('button');
      fireEvent.focus(button);
      expect(screen.getByRole('tooltip')).toHaveTextContent(/unknown rule type/i);
    });
  });

  describe('keyboard toggling of the tooltip', () => {
    it('shows the tooltip on focus and hides it on blur', () => {
      render(<AlertRuleBadge type="threshold" />);
      const button = screen.getByRole('button');

      fireEvent.focus(button);
      expect(screen.getByRole('tooltip')).toBeInTheDocument();

      fireEvent.blur(button);
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });

    it('toggles the tooltip on click', () => {
      render(<AlertRuleBadge type="threshold" />);
      const button = screen.getByRole('button');

      fireEvent.click(button);
      expect(screen.getByRole('tooltip')).toBeInTheDocument();

      fireEvent.click(button);
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });
  });
});