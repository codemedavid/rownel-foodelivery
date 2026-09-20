import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import AddressAutocompleteInput from './AddressAutocompleteInput';
import { GeocodingError } from '../lib/geocodingError';
import type { AddressCandidate } from '../lib/geocoding';

const suggestAddresses = vi.fn();

vi.mock('../lib/geocoding', async () => {
  const actual = await vi.importActual<typeof import('../lib/geocoding')>('../lib/geocoding');
  return { ...actual, suggestAddresses: (...args: unknown[]) => suggestAddresses(...args) };
});

const candidate: AddressCandidate = {
  placeId: 'poi-buko-spot',
  name: 'Buko Spot',
  displayName: 'Buko Spot, Lucena, Quezon',
  context: 'Lucena, Quezon',
  latitude: 13.95260879,
  longitude: 121.62571486,
  countryCode: 'ph',
};

type Props = React.ComponentProps<typeof AddressAutocompleteInput>;

const renderInput = (overrides: Partial<Props> = {}) => {
  const onChange = vi.fn();
  const onSelect = vi.fn();
  const utils = render(
    <AddressAutocompleteInput
      label="Delivery address"
      value=""
      onChange={onChange}
      onSelect={onSelect}
      {...overrides}
    />
  );
  return { ...utils, onChange, onSelect };
};

describe('AddressAutocompleteInput', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    suggestAddresses.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists the suggestions the search returns for a typed query', async () => {
    // Arrange
    suggestAddresses.mockResolvedValue([candidate]);

    // Act
    renderInput({ value: 'Buko' });

    // Assert
    expect(await screen.findByText('Buko Spot')).toBeInTheDocument();
    expect(screen.getByText('Lucena, Quezon')).toBeInTheDocument();
  });

  it('places the pin straight from the chosen row, with no second lookup', async () => {
    // Arrange — MapKit carries the coordinate on the suggestion itself
    const user = userEvent.setup();
    suggestAddresses.mockResolvedValue([candidate]);
    const { onSelect, onChange } = renderInput({ value: 'Buko' });

    // Act
    await user.click(await screen.findByText('Buko Spot'));

    // Assert
    expect(onSelect).toHaveBeenCalledWith(candidate);
    expect(onChange).toHaveBeenCalledWith('Buko Spot, Lucena, Quezon');
    expect(suggestAddresses).toHaveBeenCalledTimes(1);
  });

  it('tells the operator the search is unconfigured when authorisation fails', async () => {
    // Arrange
    suggestAddresses.mockRejectedValue(
      new GeocodingError('auth', 'Apple Maps could not start')
    );

    // Act
    renderInput({ value: 'Buko' });

    // Assert
    expect(await screen.findByText(/address search is not configured/i)).toBeInTheDocument();
  });

  it('points at the connection when the request never completed', async () => {
    // Arrange
    suggestAddresses.mockRejectedValue(new GeocodingError('network', 'offline'));

    // Act
    renderInput({ value: 'Buko' });

    // Assert
    expect(await screen.findByText(/check your connection/i)).toBeInTheDocument();
  });

  it('stays silent when a keystroke cancels its own in-flight request', async () => {
    // Arrange — an abort is the app's own doing, not something to report
    suggestAddresses.mockRejectedValue(new GeocodingError('aborted', 'superseded'));

    // Act
    renderInput({ value: 'Buko' });
    await waitFor(() => expect(suggestAddresses).toHaveBeenCalled());

    // Assert
    await waitFor(() => {
      expect(screen.queryByText(/manually/i)).not.toBeInTheDocument();
    });
  });

  it('cancels the previous request when the query changes', async () => {
    // Arrange
    suggestAddresses.mockResolvedValue([]);
    const { rerender } = render(
      <AddressAutocompleteInput
        label="Delivery address"
        value="Buko"
        onChange={vi.fn()}
        onSelect={vi.fn()}
      />
    );
    await waitFor(() => expect(suggestAddresses).toHaveBeenCalledTimes(1));
    const firstSignal = suggestAddresses.mock.calls[0][1].signal as AbortSignal;

    // Act
    rerender(
      <AddressAutocompleteInput
        label="Delivery address"
        value="Buko Spot"
        onChange={vi.fn()}
        onSelect={vi.fn()}
      />
    );

    // Assert
    await waitFor(() => expect(firstSignal.aborted).toBe(true));
  });

  it('stops re-requesting once authorisation is refused, since typing cannot fix it', async () => {
    // Arrange
    suggestAddresses.mockRejectedValue(new GeocodingError('auth', 'refused'));
    const { rerender } = render(
      <AddressAutocompleteInput
        label="Delivery address"
        value="Buko"
        onChange={vi.fn()}
        onSelect={vi.fn()}
      />
    );
    await screen.findByText(/address search is not configured/i);
    expect(suggestAddresses).toHaveBeenCalledTimes(1);

    // Act — the customer keeps typing
    rerender(
      <AddressAutocompleteInput
        label="Delivery address"
        value="Buko Spot"
        onChange={vi.fn()}
        onSelect={vi.fn()}
      />
    );

    // Assert
    await waitFor(() => expect(suggestAddresses).toHaveBeenCalledTimes(1));
  });

  it('keeps the field editable so the customer can still type an address', async () => {
    // Arrange
    suggestAddresses.mockRejectedValue(new GeocodingError('auth', 'refused'));

    // Act
    renderInput({ value: 'Buko' });
    await screen.findByText(/address search is not configured/i);

    // Assert
    expect(screen.getByRole('textbox')).not.toBeDisabled();
  });

  it('logs a real failure so a developer can see the cause', async () => {
    // Arrange
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    suggestAddresses.mockRejectedValue(new GeocodingError('auth', 'refused'));

    // Act
    renderInput({ value: 'Buko' });
    await screen.findByText(/address search is not configured/i);

    // Assert
    expect(consoleError).toHaveBeenCalled();
  });

  it('does not search until the query is long enough to mean something', async () => {
    // Arrange / Act
    renderInput({ value: 'Bu' });

    // Assert
    await waitFor(() => expect(suggestAddresses).not.toHaveBeenCalled());
  });

  it('biases results toward the pin the customer already placed', async () => {
    // Arrange
    suggestAddresses.mockResolvedValue([candidate]);

    // Act
    renderInput({ value: 'Buko', proximity: { latitude: 13.9, longitude: 121.6 } });

    // Assert
    await waitFor(() =>
      expect(suggestAddresses).toHaveBeenCalledWith(
        'Buko',
        expect.objectContaining({ proximity: { latitude: 13.9, longitude: 121.6 } })
      )
    );
  });
});
