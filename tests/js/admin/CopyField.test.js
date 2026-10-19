/**
 * @jest-environment jsdom
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import CopyField from '../../../admin-src/components/CopyField';

const renderField = () =>
	render(
		<CopyField
			id="sc-1"
			value='[quoteform id="1"]'
			label="Shortcode for “Cleaning”"
			buttonLabel="Copy shortcode for “Cleaning”"
		/>
	);

afterEach( () => {
	delete navigator.clipboard;
} );

describe( 'CopyField', () => {
	it( 'shows the value in a read-only box named for what it is', () => {
		renderField();

		const box = screen.getByRole( 'textbox', { name: 'Shortcode for “Cleaning”' } );

		expect( box ).toHaveValue( '[quoteform id="1"]' );
		expect( box ).toHaveAttribute( 'readonly' );
	} );

	it( 'copies and says so when the clipboard works', async () => {
		const writeText = jest.fn().mockResolvedValue( undefined );

		Object.defineProperty( navigator, 'clipboard', { value: { writeText }, configurable: true } );
		renderField();

		await userEvent.click( screen.getByRole( 'button', { name: 'Copy shortcode for “Cleaning”' } ) );

		expect( writeText ).toHaveBeenCalledWith( '[quoteform id="1"]' );
		expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Copied.' );
	} );

	it( 'selects the text and tells you how to copy when there is no clipboard', async () => {
		renderField();

		await userEvent.click( screen.getByRole( 'button', { name: 'Copy shortcode for “Cleaning”' } ) );

		const box = screen.getByRole( 'textbox' );

		expect( box.selectionStart ).toBe( 0 );
		expect( box.selectionEnd ).toBe( box.value.length );
		expect( screen.getByRole( 'status' ) ).toHaveTextContent( /to copy\.$/ );
		expect( screen.getByRole( 'status' ) ).not.toHaveTextContent( 'Copied.' );
	} );

	it( 'does not claim success when the clipboard refuses', async () => {
		const writeText = jest.fn().mockRejectedValue( new Error( 'denied' ) );

		Object.defineProperty( navigator, 'clipboard', { value: { writeText }, configurable: true } );
		renderField();

		await userEvent.click( screen.getByRole( 'button', { name: 'Copy shortcode for “Cleaning”' } ) );

		expect( screen.getByRole( 'status' ) ).not.toHaveTextContent( 'Copied.' );
		expect( screen.getByRole( 'status' ) ).toHaveTextContent( /to copy\.$/ );
	} );

	it( 'clears the message after a moment', async () => {
		jest.useFakeTimers();

		const writeText = jest.fn().mockResolvedValue( undefined );

		Object.defineProperty( navigator, 'clipboard', { value: { writeText }, configurable: true } );
		renderField();

		const user = userEvent.setup( { advanceTimers: jest.advanceTimersByTime } );

		await user.click( screen.getByRole( 'button', { name: 'Copy shortcode for “Cleaning”' } ) );
		// Under fake timers, React can commit the post-`await` state update a
		// tick after `user.click()` itself resolves — wait for it rather than
		// asserting immediately.
		await waitFor( () => expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Copied.' ) );

		act( () => {
			jest.advanceTimersByTime( 2000 );
		} );
		expect( screen.getByRole( 'status' ) ).toHaveTextContent( '' );

		jest.useRealTimers();
	} );

	it( 'names the button with the caller\'s own string, never a case-changed label', () => {
		render(
			<CopyField
				id="sc-2"
				value='[quoteform id="2"]'
				label="Shortcode für „Reinigung“"
				buttonLabel="Shortcode für „Reinigung“ kopieren"
			/>
		);

		expect(
			screen.getByRole( 'button', { name: 'Shortcode für „Reinigung“ kopieren' } )
		).toBeInTheDocument();
	} );
} );
