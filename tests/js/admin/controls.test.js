/**
 * @jest-environment jsdom
 */
import { useState } from '@wordpress/element';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import FieldError from '../../../admin-src/components/FieldError';
import MoveButtons from '../../../admin-src/components/MoveButtons';
import Notice from '../../../admin-src/components/Notice';
import NumberControl from '../../../admin-src/components/NumberControl';
import SelectControl from '../../../admin-src/components/SelectControl';
import TextControl from '../../../admin-src/components/TextControl';
import ToggleControl from '../../../admin-src/components/ToggleControl';

const oneError = [ { path: 'x', code: 'missing_field', message: 'This is required.', context: {} } ];

const positionOptions = [
	{ value: 'before', label: 'Before' },
	{ value: 'after', label: 'After' },
];

// A stateful wrapper so the model actually holds what the box reports, the
// way a real reducer-backed panel does. A bare `jest.fn()` never echoes a
// new `value` back, which is not how any controlled input is used in the
// app; this harness is what makes the assertions below meaningful for a
// controlled `NumberControl`.
function NumberHarness( { value: initialValue, onChange, ...props } ) {
	const [ value, setValue ] = useState( initialValue );

	return (
		<NumberControl
			{ ...props }
			value={ value }
			onChange={ ( next ) => {
				onChange( next );
				setValue( next );
			} }
		/>
	);
}

describe( 'FieldError', () => {
	it( 'renders nothing when there are no errors', () => {
		const { container } = render( <FieldError id="x-error" errors={ [] } /> );

		expect( container ).toBeEmptyDOMElement();
	} );

	it( 'renders every message', () => {
		render(
			<FieldError
				id="x-error"
				errors={ [
					{ code: 'a', message: 'First problem.' },
					{ code: 'b', message: 'Second problem.' },
				] }
			/>
		);

		expect( screen.getByText( 'First problem.' ) ).toBeInTheDocument();
		expect( screen.getByText( 'Second problem.' ) ).toBeInTheDocument();
	} );
} );

describe( 'TextControl', () => {
	it( 'associates its label with its input', () => {
		render( <TextControl id="title" label="Form title" value="Quote" onChange={ () => {} } /> );

		expect( screen.getByLabelText( 'Form title' ) ).toHaveValue( 'Quote' );
	} );

	it( 'reports each keystroke', async () => {
		const user = userEvent.setup();
		const onChange = jest.fn();

		render( <TextControl id="title" label="Form title" value="" onChange={ onChange } /> );

		await user.type( screen.getByLabelText( 'Form title' ), 'Hi' );

		expect( onChange ).toHaveBeenCalledTimes( 2 );
		expect( onChange ).toHaveBeenLastCalledWith( 'i' );
	} );

	it( 'marks itself invalid and describes the error', () => {
		render(
			<TextControl id="title" label="Form title" value="" onChange={ () => {} } errors={ oneError } />
		);

		const input = screen.getByLabelText( 'Form title' );

		expect( input ).toHaveAttribute( 'aria-invalid', 'true' );
		expect( input ).toHaveAccessibleDescription( 'This is required.' );
	} );

	it( 'describes its help text when there is no error', () => {
		render(
			<TextControl
				id="title"
				label="Form title"
				value=""
				onChange={ () => {} }
				help="Shown at the top of the form."
			/>
		);

		const input = screen.getByLabelText( 'Form title' );

		expect( input ).toHaveAccessibleDescription( 'Shown at the top of the form.' );
		expect( input ).not.toHaveAttribute( 'aria-invalid' );
	} );

	// Kills: `{ help && ! hasErrors && ( ... ) }` — reverting `aria-describedby`
	// to only ever reference one of the two would drop the help text out of
	// the accessible description, or drop the error out of it.
	it( 'exposes both help and error text in its accessible description', () => {
		render(
			<TextControl
				id="title"
				label="Form title"
				value=""
				onChange={ () => {} }
				errors={ oneError }
				help="Shown at the top of the form."
			/>
		);

		const input = screen.getByLabelText( 'Form title' );

		expect( input ).toHaveAccessibleDescription(
			'This is required. Shown at the top of the form.'
		);
	} );

	it( 'renders a textarea when multiline', () => {
		render(
			<TextControl id="msg" label="Message" value="" onChange={ () => {} } multiline />
		);

		expect( screen.getByLabelText( 'Message' ).tagName ).toBe( 'TEXTAREA' );
	} );

	it( 'disables the input when told to, so a referenced key cannot be edited', () => {
		render(
			<TextControl id="key" label="Key" value="rooms" onChange={ () => {} } disabled />
		);

		expect( screen.getByLabelText( 'Key' ) ).toBeDisabled();
	} );

	// Kills: a `describedBy` implementation that replaces the computed
	// error/help ids instead of appending to them.
	it( 'appends an extra describedBy id alongside the error and help ids, not in place of them', () => {
		render(
			<TextControl
				id="title"
				label="Form title"
				value=""
				onChange={ () => {} }
				errors={ oneError }
				help="Shown at the top of the form."
				describedBy="extra-warning"
			/>
		);

		expect( screen.getByLabelText( 'Form title' ).getAttribute( 'aria-describedby' ) ).toBe(
			'title-error title-help extra-warning'
		);
	} );

	it( 'passes onFocus, onBlur, and onKeyDown through to the underlying element', () => {
		const onFocus = jest.fn();
		const onBlur = jest.fn();
		const onKeyDown = jest.fn();

		render(
			<TextControl
				id="title"
				label="Form title"
				value=""
				onChange={ () => {} }
				onFocus={ onFocus }
				onBlur={ onBlur }
				onKeyDown={ onKeyDown }
			/>
		);

		const input = screen.getByLabelText( 'Form title' );

		fireEvent.focus( input );
		fireEvent.keyDown( input, { key: 'Enter' } );
		fireEvent.blur( input );

		expect( onFocus ).toHaveBeenCalledTimes( 1 );
		expect( onKeyDown ).toHaveBeenCalledTimes( 1 );
		expect( onBlur ).toHaveBeenCalledTimes( 1 );
	} );
} );

describe( 'NumberControl', () => {
	it( 'reports a number, not a string', async () => {
		const user = userEvent.setup();
		const onChange = jest.fn();

		render( <NumberHarness id="dec" label="Decimals" value={ 2 } onChange={ onChange } /> );

		await user.clear( screen.getByLabelText( 'Decimals' ) );
		await user.type( screen.getByLabelText( 'Decimals' ), '4' );

		expect( onChange ).toHaveBeenLastCalledWith( 4 );
	} );

	it( 'reports an empty box as null rather than NaN', async () => {
		const user = userEvent.setup();
		const onChange = jest.fn();

		render( <NumberHarness id="dec" label="Decimals" value={ 2 } onChange={ onChange } /> );

		await user.clear( screen.getByLabelText( 'Decimals' ) );

		expect( onChange ).toHaveBeenLastCalledWith( null );
	} );

	// A plain <input type="number"> sanitises "1." to "" before the change
	// handler ever sees it, so the decimal point is never at risk of being
	// swallowed by `Number()` — this pins that a controlled implementation
	// keeps it visible in the box, not just reported correctly.
	it( 'reports a typed decimal and keeps the decimal point visible', async () => {
		const user = userEvent.setup();
		const onChange = jest.fn();

		render( <NumberHarness id="dec" label="Decimals" value={ null } onChange={ onChange } /> );

		const input = screen.getByLabelText( 'Decimals' );

		await user.type( input, '1.5' );

		expect( onChange ).toHaveBeenLastCalledWith( 1.5 );
		expect( input ).toHaveValue( 1.5 );
	} );

	it( 'reports a typed negative number', async () => {
		const user = userEvent.setup();
		const onChange = jest.fn();

		render( <NumberHarness id="dec" label="Decimals" value={ null } onChange={ onChange } /> );

		const input = screen.getByLabelText( 'Decimals' );

		await user.type( input, '-7' );

		expect( onChange ).toHaveBeenLastCalledWith( -7 );
	} );

	// A caller (e.g. a sibling field being reset, or an undo) can change
	// `value` without the box itself having been typed into — the box must
	// still follow the prop.
	it( 'reflects an externally changed value', () => {
		const { rerender } = render(
			<NumberControl id="dec" label="Decimals" value={ 2 } onChange={ () => {} } />
		);

		rerender( <NumberControl id="dec" label="Decimals" value={ 9 } onChange={ () => {} } /> );

		expect( screen.getByLabelText( 'Decimals' ) ).toHaveValue( 9 );
	} );

	// Kills: deleting `aria-invalid`/`aria-describedby`, or the ternary that
	// clears them when there are no errors.
	it( 'marks itself invalid and describes the error', () => {
		render(
			<NumberControl id="dec" label="Decimals" value={ 2 } onChange={ () => {} } errors={ oneError } />
		);

		const input = screen.getByLabelText( 'Decimals' );

		expect( input ).toHaveAttribute( 'aria-invalid', 'true' );
		expect( input ).toHaveAccessibleDescription( 'This is required.' );
	} );

	it( 'has no aria-invalid attribute when there are no errors', () => {
		render( <NumberControl id="dec" label="Decimals" value={ 2 } onChange={ () => {} } /> );

		expect( screen.getByLabelText( 'Decimals' ) ).not.toHaveAttribute( 'aria-invalid' );
	} );

	it( 'exposes both help and error text in its accessible description', () => {
		render(
			<NumberControl
				id="dec"
				label="Decimals"
				value={ 2 }
				onChange={ () => {} }
				errors={ oneError }
				help="Enter a whole number."
			/>
		);

		const input = screen.getByLabelText( 'Decimals' );

		expect( input ).toHaveAccessibleDescription( 'This is required. Enter a whole number.' );
	} );
} );

describe( 'SelectControl', () => {
	it( 'renders its options and reports the chosen value', async () => {
		const user = userEvent.setup();
		const onChange = jest.fn();

		render(
			<SelectControl
				id="pos"
				label="Currency position"
				value="before"
				onChange={ onChange }
				options={ positionOptions }
			/>
		);

		await user.selectOptions( screen.getByLabelText( 'Currency position' ), 'after' );

		expect( onChange ).toHaveBeenCalledWith( 'after' );
	} );

	// Kills: dropping the placeholder-option branch entirely. Without it, a
	// value that matches no option silently falls back to the first option
	// in the DOM while the model still holds the unrecognised value, and
	// selecting the now-highlighted (but not actually selected) option fires
	// no change event, so the user cannot get out of the mismatch.
	it( 'renders a placeholder for a value that matches no option, so the mismatch is visible', () => {
		render(
			<SelectControl
				id="pos"
				label="Currency position"
				value="ghost"
				onChange={ () => {} }
				options={ [
					{ value: 'a', label: 'A' },
					{ value: 'b', label: 'B' },
				] }
			/>
		);

		const select = screen.getByLabelText( 'Currency position' );

		expect( select ).toHaveValue( 'ghost' );
		expect( screen.getByText( 'Unrecognised value: ghost' ) ).toBeInTheDocument();
	} );

	// Kills: treating `placeholder` as a blanket replacement for the
	// unrecognised-value option instead of one that only applies to an
	// empty, not-yet-chosen value.
	it( 'shows the placeholder rather than "Unrecognised value" for an empty value', () => {
		render(
			<SelectControl
				id="pos"
				label="Currency position"
				value=""
				onChange={ () => {} }
				options={ positionOptions }
				placeholder="Choose a position…"
			/>
		);

		expect( screen.getByText( 'Choose a position…' ) ).toBeInTheDocument();
		expect( screen.queryByText( /Unrecognised value/ ) ).not.toBeInTheDocument();
	} );

	// The corrupt-data case (a stored key whose field was deleted) must
	// still be reported even when the control also has a `placeholder`.
	it( 'still shows "Unrecognised value" for a non-empty value not among the options', () => {
		render(
			<SelectControl
				id="pos"
				label="Currency position"
				value="ghost"
				onChange={ () => {} }
				options={ positionOptions }
				placeholder="Choose a position…"
			/>
		);

		expect( screen.getByText( 'Unrecognised value: ghost' ) ).toBeInTheDocument();
		expect( screen.queryByText( 'Choose a position…' ) ).not.toBeInTheDocument();
	} );

	// Kills: removing the `options = []` default — today omitting `options`
	// throws inside `.map()` before the component ever renders.
	it( 'does not throw when options are omitted', () => {
		expect( () =>
			render( <SelectControl id="pos" label="Currency position" value="" onChange={ () => {} } /> )
		).not.toThrow();
	} );

	it( 'marks itself invalid and describes the error', () => {
		render(
			<SelectControl
				id="pos"
				label="Currency position"
				value="before"
				onChange={ () => {} }
				options={ positionOptions }
				errors={ oneError }
			/>
		);

		const select = screen.getByLabelText( 'Currency position' );

		expect( select ).toHaveAttribute( 'aria-invalid', 'true' );
		expect( select ).toHaveAccessibleDescription( 'This is required.' );
	} );

	it( 'has no aria-invalid attribute when there are no errors', () => {
		render(
			<SelectControl
				id="pos"
				label="Currency position"
				value="before"
				onChange={ () => {} }
				options={ positionOptions }
			/>
		);

		expect( screen.getByLabelText( 'Currency position' ) ).not.toHaveAttribute( 'aria-invalid' );
	} );

	it( 'exposes both help and error text in its accessible description', () => {
		render(
			<SelectControl
				id="pos"
				label="Currency position"
				value="before"
				onChange={ () => {} }
				options={ positionOptions }
				errors={ oneError }
				help="Choose where the currency symbol appears."
			/>
		);

		const select = screen.getByLabelText( 'Currency position' );

		expect( select ).toHaveAccessibleDescription(
			'This is required. Choose where the currency symbol appears.'
		);
	} );

	// Kills: `value={ value }` weakened to `defaultValue={ value }` — an
	// uncontrolled select keeps whatever was there at mount and never
	// follows a later prop change.
	it( 'stays controlled: an updated value prop is reflected, not just the initial one', () => {
		const { rerender } = render(
			<SelectControl
				id="pos"
				label="Currency position"
				value="before"
				onChange={ () => {} }
				options={ positionOptions }
			/>
		);

		rerender(
			<SelectControl
				id="pos"
				label="Currency position"
				value="after"
				onChange={ () => {} }
				options={ positionOptions }
			/>
		);

		expect( screen.getByLabelText( 'Currency position' ) ).toHaveValue( 'after' );
	} );
} );

describe( 'ToggleControl', () => {
	it( 'is a real checkbox and reports a boolean', async () => {
		const user = userEvent.setup();
		const onChange = jest.fn();

		render(
			<ToggleControl id="req" label="Required" checked={ false } onChange={ onChange } />
		);

		await user.click( screen.getByRole( 'checkbox', { name: 'Required' } ) );

		expect( onChange ).toHaveBeenCalledWith( true );
	} );

	it( 'marks itself invalid and describes the error', () => {
		render(
			<ToggleControl id="req" label="Required" checked={ false } onChange={ () => {} } errors={ oneError } />
		);

		const checkbox = screen.getByRole( 'checkbox', { name: 'Required' } );

		expect( checkbox ).toHaveAttribute( 'aria-invalid', 'true' );
		expect( checkbox ).toHaveAccessibleDescription( 'This is required.' );
	} );

	it( 'has no aria-invalid attribute when there are no errors', () => {
		render( <ToggleControl id="req" label="Required" checked={ false } onChange={ () => {} } /> );

		expect( screen.getByRole( 'checkbox', { name: 'Required' } ) ).not.toHaveAttribute(
			'aria-invalid'
		);
	} );

	it( 'exposes both help and error text in its accessible description', () => {
		render(
			<ToggleControl
				id="req"
				label="Required"
				checked={ false }
				onChange={ () => {} }
				errors={ oneError }
				help="Customers must fill this in."
			/>
		);

		const checkbox = screen.getByRole( 'checkbox', { name: 'Required' } );

		expect( checkbox ).toHaveAccessibleDescription(
			'This is required. Customers must fill this in.'
		);
	} );

	// Kills: `checked={ checked }` weakened to `defaultChecked={ checked }`.
	it( 'stays controlled: an updated checked prop is reflected, not just the initial one', () => {
		const { rerender } = render(
			<ToggleControl id="req" label="Required" checked={ false } onChange={ () => {} } />
		);

		rerender( <ToggleControl id="req" label="Required" checked onChange={ () => {} } /> );

		expect( screen.getByRole( 'checkbox', { name: 'Required' } ) ).toBeChecked();
	} );
} );

describe( 'MoveButtons', () => {
	it( 'names what it moves, so a screen reader is not read "Up, Up, Up"', () => {
		render(
			<MoveButtons
				label="Rooms"
				onMoveUp={ () => {} }
				onMoveDown={ () => {} }
				canMoveUp
				canMoveDown
			/>
		);

		expect( screen.getByRole( 'button', { name: 'Move Rooms up' } ) ).toBeEnabled();
		expect( screen.getByRole( 'button', { name: 'Move Rooms down' } ) ).toBeEnabled();
	} );

	it( 'disables the ends rather than hiding them, so the layout does not jump', () => {
		render(
			<MoveButtons
				label="Rooms"
				onMoveUp={ () => {} }
				onMoveDown={ () => {} }
				canMoveUp={ false }
				canMoveDown
			/>
		);

		expect( screen.getByRole( 'button', { name: 'Move Rooms up' } ) ).toBeDisabled();
	} );

	// Kills: never disabling the down button at the bottom end — the "up"
	// test above only ever exercised the top end.
	it( 'disables the down button at the bottom end', () => {
		render(
			<MoveButtons
				label="Rooms"
				onMoveUp={ () => {} }
				onMoveDown={ () => {} }
				canMoveUp
				canMoveDown={ false }
			/>
		);

		expect( screen.getByRole( 'button', { name: 'Move Rooms down' } ) ).toBeDisabled();
	} );

	it( 'moves on click', async () => {
		const user = userEvent.setup();
		const onMoveUp = jest.fn();

		render(
			<MoveButtons label="Rooms" onMoveUp={ onMoveUp } onMoveDown={ () => {} } canMoveUp canMoveDown />
		);

		await user.click( screen.getByRole( 'button', { name: 'Move Rooms up' } ) );

		expect( onMoveUp ).toHaveBeenCalled();
	} );

	// Kills: wiring the down button to `onMoveUp` (or to nothing) — the only
	// existing click test exercised "up".
	it( 'moves down on click', async () => {
		const user = userEvent.setup();
		const onMoveDown = jest.fn();

		render(
			<MoveButtons label="Rooms" onMoveUp={ () => {} } onMoveDown={ onMoveDown } canMoveUp canMoveDown />
		);

		await user.click( screen.getByRole( 'button', { name: 'Move Rooms down' } ) );

		expect( onMoveDown ).toHaveBeenCalled();
	} );
} );

describe( 'Notice', () => {
	it( 'announces an error assertively', () => {
		render( <Notice status="error">Something went wrong.</Notice> );

		const notice = screen.getByRole( 'alert' );

		expect( notice ).toHaveTextContent( 'Something went wrong.' );
	} );

	it( 'announces success politely, not as an alert', () => {
		render( <Notice status="success">Saved.</Notice> );

		expect( screen.queryByRole( 'alert' ) ).not.toBeInTheDocument();
		expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Saved.' );
	} );

	// Kills: changing the default `status` from 'info' to 'error' (no test
	// rendered a status-less Notice before), and dropping the
	// `quoteform_notice--{status}` modifier class.
	it( 'defaults to an info status that does not interrupt, with the modifier class present', () => {
		const { container } = render( <Notice>Heads up.</Notice> );

		expect( screen.queryByRole( 'alert' ) ).not.toBeInTheDocument();
		expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Heads up.' );
		expect( container.firstChild ).toHaveClass( 'quoteform_notice--info' );
	} );

	it( 'dismisses when asked', async () => {
		const user = userEvent.setup();
		const onDismiss = jest.fn();

		render(
			<Notice status="error" onDismiss={ onDismiss }>
				Something went wrong.
			</Notice>
		);

		await user.click( screen.getByRole( 'button', { name: 'Dismiss this notice' } ) );

		expect( onDismiss ).toHaveBeenCalled();
	} );
} );
