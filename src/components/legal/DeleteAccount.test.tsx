import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DeleteAccount from './DeleteAccount';
import { PRIVACY_CONTACT_EMAIL } from './legalContent';

const renderPage = () =>
  render(
    <MemoryRouter>
      <DeleteAccount />
    </MemoryRouter>
  );

describe('DeleteAccount', () => {
  it('names the app and gives the in-app steps', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: /delete your row-nel account/i })).toBeInTheDocument();
    expect(screen.getByText(/open the row-nel food delivery app/i)).toBeInTheDocument();
    expect(screen.getByText(/tap "delete account"/i)).toBeInTheDocument();
  });

  it('says what is deleted and what is kept', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'What is deleted' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What is kept' })).toBeInTheDocument();
  });

  it('offers an email route for people who cannot sign in', () => {
    renderPage();

    expect(screen.getByRole('link', { name: PRIVACY_CONTACT_EMAIL })).toHaveAttribute(
      'href',
      `mailto:${PRIVACY_CONTACT_EMAIL}`
    );
  });
});
