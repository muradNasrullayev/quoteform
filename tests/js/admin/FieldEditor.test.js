/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import FieldEditor from '../../../admin-src/panels/FieldEditor';
import { StoreProvider, useDispatch, useStore } from '../../../admin-src/state/StoreContext';
import { loadSucceeded } from '../../../admin-src/state/actions';
import { defaultField } from '../../../admin-src/state/fields';
import { indexErrors } from '../../../admin-src/state/errors';

function Harness( { fields, steps = [], calculations = [], rules = [], errorIndex, fieldKey } ) {
	const dispatch = useDispatch();
	const { schema } = useStore();

	return (
		<>
			<button
				onClick={ () =>
					dispatch(
						loadSucceeded( {
							id: 1,
							title: 'F',
							schema: {
								version: 1,
								settings: {},
								fields,
								steps,
								calculations,
								rules,
								notifications: [],
							},
						} )
					)
				}
			>
				load
			</button>
			{ schema && <FieldEditor fieldKey={ fieldKey } errorIndex={ errorIndex } /> }
			{ schema && <pre data-testid="debug-fields">{ JSON.stringify( schema.fields ) }</pre> }
		</>
	);
}

function fieldsSnapshot() {
	return JSON.parse( screen.getByTestId( 'debug-fields' ).textContent );
}

async function renderEditor( props ) {
	const user = userEvent.setup();

	const { rerender: rtlRerender } = render(
		<StoreProvider>
			<Harness errorIndex={ indexErrors( [] ) } { ...props } />
		</StoreProvider>
	);

	await user.click( screen.getByRole( 'button', { name: 'load' } ) );

	const rerender = ( nextProps ) =>
		rtlRerender(
			<StoreProvider>
				<Harness errorIndex={ indexErrors( [] ) } { ...props } { ...nextProps } />
			</StoreProvider>
		);

	return { user, rerender };
}

describe( 'common properties', () => {
	it( 'edits the label', async () => {
		const { user } = await renderEditor( {
			fields: { rooms: defaultField( 'number', 'rooms', 'Rooms' ) },
			fieldKey: 'rooms',
		} );

		await user.clear( screen.getByLabelText( 'Label' ) );
		await user.type( screen.getByLabelText( 'Label' ), 'How many?' );

		expect( screen.getByLabelText( 'Label' ) ).toHaveValue( 'How many?' );
	} );

	it( 'shows the required toggle', async () => {
		await renderEditor( {
			fields: { rooms: defaultField( 'number', 'rooms', 'Rooms' ) },
			fieldKey: 'rooms',
		} );

		expect( screen.getByRole( 'checkbox', { name: 'Required' } ) ).toBeInTheDocument();
	} );

	it( 'renders nothing when the selected field is gone', async () => {
		await renderEditor( { fields: {}, fieldKey: 'ghost' } );

		expect( screen.queryByLabelText( 'Label' ) ).not.toBeInTheDocument();
	} );

	// Kills: a mutant that wires any of these controls' `onChange` to the
	// wrong field key (e.g. swapping `help` and `placeholder`, or writing
	// `min` into `max`) — each assertion checks the WHOLE field object,
	// so a cross-wired control shows up as an unexpected diff even though
	// its own displayed value would look correct in isolation.
	it.each( [
		[ 'Help text', 'help', 'Some help text' ],
		[ 'Placeholder', 'placeholder', 'Type here' ],
	] )( '%s writes only its own key', async ( label, key, typed ) => {
		const base = defaultField( 'number', 'rooms', 'Rooms' );
		const { user } = await renderEditor( { fields: { rooms: base }, fieldKey: 'rooms' } );

		await user.clear( screen.getByLabelText( label ) );
		await user.type( screen.getByLabelText( label ), typed );

		expect( fieldsSnapshot().rooms ).toEqual( { ...base, [ key ]: typed } );
	} );

	it.each( [
		[ 'Minimum', 'min', 5 ],
		[ 'Maximum', 'max', 200 ],
		[ 'Step', 'step', 2 ],
	] )( '%s writes only its own key', async ( label, key, typed ) => {
		const base = defaultField( 'number', 'rooms', 'Rooms' );
		const { user } = await renderEditor( { fields: { rooms: base }, fieldKey: 'rooms' } );

		await user.clear( screen.getByLabelText( label ) );
		await user.type( screen.getByLabelText( label ), String( typed ) );

		expect( fieldsSnapshot().rooms ).toEqual( { ...base, [ key ]: typed } );
	} );

	it( 'Required writes only "required"', async () => {
		const base = defaultField( 'number', 'rooms', 'Rooms' );
		const { user } = await renderEditor( { fields: { rooms: base }, fieldKey: 'rooms' } );

		await user.click( screen.getByRole( 'checkbox', { name: 'Required' } ) );

		expect( fieldsSnapshot().rooms ).toEqual( { ...base, required: true } );
	} );

	it( 'Content writes only "content"', async () => {
		const base = defaultField( 'html', 'intro', '' );
		const { user } = await renderEditor( { fields: { intro: base }, fieldKey: 'intro' } );

		await user.clear( screen.getByLabelText( 'Content' ) );
		await user.type( screen.getByLabelText( 'Content' ), 'New content' );

		expect( fieldsSnapshot().intro ).toEqual( { ...base, content: 'New content' } );
	} );
} );

describe( 'the key rule', () => {
	it( 'lets an unreferenced key be edited', async () => {
		await renderEditor( {
			fields: { rooms: defaultField( 'number', 'rooms', 'Rooms' ) },
			fieldKey: 'rooms',
		} );

		expect( screen.getByLabelText( 'Key' ) ).toBeEnabled();
	} );

	it( 'locks a referenced key and says where it is used', async () => {
		await renderEditor( {
			fields: { rooms: defaultField( 'number', 'rooms', 'Rooms' ) },
			calculations: [ { key: 'total', expression: '{rooms} * 50', label: 'Total', visible: true } ],
			fieldKey: 'rooms',
		} );

		expect( screen.getByLabelText( 'Key' ) ).toBeDisabled();
		expect( screen.getByText( /the calculation “total”/ ) ).toBeInTheDocument();
	} );

	it( 'warns about a key the server would reject, without blocking the edit', async () => {
		const { user } = await renderEditor( {
			fields: { rooms: defaultField( 'number', 'rooms', 'Rooms' ) },
			fieldKey: 'rooms',
		} );

		await user.clear( screen.getByLabelText( 'Key' ) );
		await user.type( screen.getByLabelText( 'Key' ), 'Bad Key' );

		const warning = screen.getByText( 'A key must start with a lowercase letter and use only lowercase letters, numbers and underscores.' );

		expect( warning ).toBeInTheDocument();

		// D3: the warning is linked to the Key input and announced
		// politely, not just visible.
		expect( screen.getByLabelText( 'Key' ).getAttribute( 'aria-describedby' ) ).toContain(
			'quoteform_field-key-shape-warning'
		);
		expect( warning ).toHaveAttribute( 'aria-live', 'polite' );
	} );

	it( 'warns about a reserved key, without blocking the edit', async () => {
		// Kills: a mutant that removes the `isReservedKey` warning branch
		// entirely — no test exercised this path before.
		await renderEditor( {
			fields: { rooms: defaultField( 'number', 'rooms', 'Rooms' ) },
			fieldKey: 'rooms',
		} );

		fireEvent.change( screen.getByLabelText( 'Key' ), { target: { value: 'constructor' } } );

		const warning = screen.getByText( 'That key is reserved. Choose another one.' );

		expect( warning ).toBeInTheDocument();
		expect( screen.getByLabelText( 'Key' ) ).toBeEnabled();
		expect( fieldsSnapshot().rooms.key ).toBe( 'rooms' );

		expect( screen.getByLabelText( 'Key' ).getAttribute( 'aria-describedby' ) ).toContain(
			'quoteform_field-key-reserved-warning'
		);
		expect( warning ).toHaveAttribute( 'aria-live', 'polite' );
	} );

	it( 'never dispatches while typing — no intermediate key ever reaches the schema', async () => {
		// Kills: a mutant that reintroduces per-keystroke dispatch from
		// `onChange`. Every prefix of "area" typed on the way there
		// ('a', 'ar', 'are') is itself a valid, free key, so a
		// per-keystroke dispatcher would have created and replaced
		// several map entries before this assertion ever runs.
		const { user } = await renderEditor( {
			fields: { rooms: defaultField( 'number', 'rooms', 'Rooms' ) },
			fieldKey: 'rooms',
		} );

		await user.clear( screen.getByLabelText( 'Key' ) );
		await user.type( screen.getByLabelText( 'Key' ), 'area' );

		expect( Object.keys( fieldsSnapshot() ) ).toEqual( [ 'rooms' ] );
	} );

	it( 'commits the rename on blur, once, with the final typed key', async () => {
		const { user } = await renderEditor( {
			fields: { rooms: defaultField( 'number', 'rooms', 'Rooms' ) },
			fieldKey: 'rooms',
		} );

		await user.clear( screen.getByLabelText( 'Key' ) );
		await user.type( screen.getByLabelText( 'Key' ), 'area' );
		await user.tab();

		expect( Object.keys( fieldsSnapshot() ) ).toEqual( [ 'area' ] );
		expect( fieldsSnapshot().area.key ).toBe( 'area' );
		expect( screen.getByLabelText( 'Key' ) ).toHaveValue( 'area' );
		expect( screen.getByLabelText( 'Key' ) ).toBeEnabled();
	} );

	it( 'commits the rename on Enter, without requiring a blur', async () => {
		const { user } = await renderEditor( {
			fields: { rooms: defaultField( 'number', 'rooms', 'Rooms' ) },
			fieldKey: 'rooms',
		} );

		const input = screen.getByLabelText( 'Key' );

		await user.clear( input );
		await user.type( input, 'area' );
		fireEvent.keyDown( input, { key: 'Enter' } );

		expect( Object.keys( fieldsSnapshot() ) ).toEqual( [ 'area' ] );
		expect( fieldsSnapshot().area.key ).toBe( 'area' );
		expect( screen.getByLabelText( 'Key' ) ).toHaveValue( 'area' );
	} );

	it( 'abandons an in-progress rename on Escape, restoring the original key', async () => {
		const { user } = await renderEditor( {
			fields: {
				rooms: defaultField( 'number', 'rooms', 'Rooms' ),
			},
			fieldKey: 'rooms',
		} );

		const input = screen.getByLabelText( 'Key' );

		await user.clear( input );
		await user.type( input, 'notes' );
		fireEvent.keyDown( input, { key: 'Escape' } );

		expect( Object.keys( fieldsSnapshot() ) ).toEqual( [ 'rooms' ] );
		expect( screen.getByLabelText( 'Key' ) ).toHaveValue( 'rooms' );
	} );

	it( 'does nothing, and warns, when the draft names a key another field already has', async () => {
		await renderEditor( {
			fields: {
				rooms: defaultField( 'number', 'rooms', 'Rooms' ),
				notes: defaultField( 'text', 'notes', 'Notes' ),
			},
			fieldKey: 'rooms',
		} );

		fireEvent.change( screen.getByLabelText( 'Key' ), { target: { value: 'notes' } } );

		expect( screen.getByText( 'That key is already used by another field.' ) ).toBeInTheDocument();
		expect( screen.getByLabelText( 'Key' ) ).toBeEnabled();
		expect( Object.keys( fieldsSnapshot() ).sort() ).toEqual( [ 'notes', 'rooms' ] );
		expect( fieldsSnapshot().rooms.key ).toBe( 'rooms' );

		// D3: announced to a screen reader, not just visible.
		expect( screen.getByLabelText( 'Key' ).getAttribute( 'aria-describedby' ) ).toContain(
			'quoteform_field-key-taken-warning'
		);

		const warning = screen.getByText( 'That key is already used by another field.' );

		expect( warning ).toHaveAttribute( 'aria-live', 'polite' );
	} );

	it( 'restores the real key on blur when the draft was never committable', async () => {
		await renderEditor( {
			fields: {
				rooms: defaultField( 'number', 'rooms', 'Rooms' ),
				notes: defaultField( 'text', 'notes', 'Notes' ),
			},
			fieldKey: 'rooms',
		} );

		fireEvent.change( screen.getByLabelText( 'Key' ), { target: { value: 'notes' } } );
		fireEvent.blur( screen.getByLabelText( 'Key' ) );

		expect( screen.getByLabelText( 'Key' ) ).toHaveValue( 'rooms' );
		expect( screen.queryByText( 'That key is already used by another field.' ) ).not.toBeInTheDocument();
	} );

	it( 'resyncs the draft when a different field is selected', async () => {
		const { rerender } = await renderEditor( {
			fields: {
				rooms: defaultField( 'number', 'rooms', 'Rooms' ),
				notes: defaultField( 'text', 'notes', 'Notes' ),
			},
			fieldKey: 'rooms',
		} );

		fireEvent.change( screen.getByLabelText( 'Key' ), { target: { value: 'Bad Key' } } );
		expect( screen.getByLabelText( 'Key' ) ).toHaveValue( 'Bad Key' );

		rerender( { fieldKey: 'notes' } );

		expect( screen.getByLabelText( 'Key' ) ).toHaveValue( 'notes' );
	} );
} );

describe( 'type-specific properties', () => {
	it( 'shows the range controls for a number', async () => {
		await renderEditor( {
			fields: { rooms: defaultField( 'number', 'rooms', 'Rooms' ) },
			fieldKey: 'rooms',
		} );

		expect( screen.getByLabelText( 'Minimum' ) ).toBeInTheDocument();
		expect( screen.getByLabelText( 'Maximum' ) ).toBeInTheDocument();
		expect( screen.getByLabelText( 'Step' ) ).toBeInTheDocument();
	} );

	it( 'does not show the range controls for a text field', async () => {
		await renderEditor( {
			fields: { notes: defaultField( 'text', 'notes', 'Notes' ) },
			fieldKey: 'notes',
		} );

		expect( screen.queryByLabelText( 'Minimum' ) ).not.toBeInTheDocument();
	} );

	it( 'shows the content box for html, and no label box', async () => {
		await renderEditor( {
			fields: { intro: defaultField( 'html', 'intro', '' ) },
			fieldKey: 'intro',
		} );

		// Kills: a mutant that drops the `LABEL_OPTIONAL_TYPES` check and
		// renders the Label box for every type — this test's own name
		// promises "no label box" but the original never asserted it.
		expect( screen.getByLabelText( 'Content' ) ).toBeInTheDocument();
		expect( screen.queryByLabelText( 'Label' ) ).not.toBeInTheDocument();

		// Kills: a mutant that drops `multiline` from the Content
		// TextControl, rendering a single-line `<input>` instead of a
		// `<textarea>`.
		expect( screen.getByLabelText( 'Content' ).tagName ).toBe( 'TEXTAREA' );
	} );

	it( 'shows the options editor for a select', async () => {
		await renderEditor( {
			fields: { plan: defaultField( 'select', 'plan', 'Plan' ) },
			fieldKey: 'plan',
		} );

		expect( screen.getByLabelText( 'Option 1 label' ) ).toBeInTheDocument();
		expect( screen.getByLabelText( 'Option 1 value' ) ).toBeInTheDocument();
		expect( screen.getByLabelText( 'Option 1 price' ) ).toBeInTheDocument();
	} );
} );

describe( 'the options editor', () => {
	it( 'adds an option', async () => {
		const { user } = await renderEditor( {
			fields: { plan: defaultField( 'select', 'plan', 'Plan' ) },
			fieldKey: 'plan',
		} );

		await user.click( screen.getByRole( 'button', { name: 'Add option' } ) );

		expect( screen.getByLabelText( 'Option 2 label' ) ).toBeInTheDocument();
	} );

	it( 'removes an option', async () => {
		const { user } = await renderEditor( {
			fields: { plan: defaultField( 'select', 'plan', 'Plan' ) },
			fieldKey: 'plan',
		} );

		await user.click( screen.getByRole( 'button', { name: 'Add option' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Remove option 2' } ) );

		expect( screen.queryByLabelText( 'Option 2 label' ) ).not.toBeInTheDocument();
	} );

	it( 'never reuses an option value that is still on another option', async () => {
		const { user } = await renderEditor( {
			fields: { plan: defaultField( 'select', 'plan', 'Plan' ) },
			fieldKey: 'plan',
		} );

		await user.click( screen.getByRole( 'button', { name: 'Add option' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Add option' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Remove option 2' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Add option' } ) );

		const values = fieldsSnapshot().plan.options.map( ( option ) => option.value );

		expect( new Set( values ).size ).toBe( values.length );
	} );

	it( 'keeps focus on the moved option, so pressing move down twice moves the same one twice', async () => {
		const { user } = await renderEditor( {
			fields: {
				plan: {
					...defaultField( 'select', 'plan', 'Plan' ),
					options: [
						{ label: 'Bronze', value: 'bronze', price: 1 },
						{ label: 'Silver', value: 'silver', price: 2 },
						{ label: 'Gold', value: 'gold', price: 3 },
					],
				},
			},
			fieldKey: 'plan',
		} );

		await user.click( screen.getByRole( 'button', { name: 'Move option 1 down' } ) );

		expect( document.activeElement ).toHaveAccessibleName( 'Move option 2 down' );

		await user.keyboard( '{Enter}' );

		expect( fieldsSnapshot().plan.options.map( ( option ) => option.value ) ).toEqual( [
			'silver',
			'gold',
			'bronze',
		] );
	} );

	it( 'reorders options', async () => {
		const { user } = await renderEditor( {
			fields: { plan: defaultField( 'select', 'plan', 'Plan' ) },
			fieldKey: 'plan',
		} );

		await user.click( screen.getByRole( 'button', { name: 'Add option' } ) );
		await user.clear( screen.getByLabelText( 'Option 2 label' ) );
		await user.type( screen.getByLabelText( 'Option 2 label' ), 'Second' );
		await user.click( screen.getByRole( 'button', { name: 'Move option 2 up' } ) );

		expect( screen.getByLabelText( 'Option 1 label' ) ).toHaveValue( 'Second' );
	} );

	it( 'keeps a price numeric', async () => {
		const { user } = await renderEditor( {
			fields: { plan: defaultField( 'select', 'plan', 'Plan' ) },
			fieldKey: 'plan',
		} );

		await user.clear( screen.getByLabelText( 'Option 1 price' ) );
		await user.type( screen.getByLabelText( 'Option 1 price' ), '60' );

		expect( screen.getByLabelText( 'Option 1 price' ) ).toHaveValue( 60 );
	} );

	it( 'puts a server error on the option it belongs to', async () => {
		await renderEditor( {
			fields: { plan: defaultField( 'select', 'plan', 'Plan' ) },
			fieldKey: 'plan',
			errorIndex: indexErrors( [
				{
					path: 'fields.plan.options.0.price',
					code: 'invalid_type',
					message: 'A price must be a number.',
					context: {},
				},
			] ),
		} );

		expect( screen.getByLabelText( 'Option 1 price' ) ).toHaveAccessibleDescription(
			'A price must be a number.'
		);
	} );

	it( 'routes an error to the option it belongs to and not its neighbor', async () => {
		// Kills: a mutant that builds the error path with the wrong index
		// (e.g. always `0`, or off by one) — only option 1's error was
		// ever asserted before, so a mutant misrouting to option 1 for
		// EVERY option's error would have gone unnoticed.
		await renderEditor( {
			fields: {
				plan: {
					...defaultField( 'select', 'plan', 'Plan' ),
					options: [
						{ label: 'A', value: 'a', price: 10 },
						{ label: 'B', value: 'b', price: 20 },
					],
				},
			},
			fieldKey: 'plan',
			errorIndex: indexErrors( [
				{
					path: 'fields.plan.options.1.price',
					code: 'invalid_type',
					message: 'Option 2 price is bad.',
					context: {},
				},
			] ),
		} );

		expect( screen.getByLabelText( 'Option 2 price' ) ).toHaveAccessibleDescription(
			'Option 2 price is bad.'
		);
		expect( screen.getByLabelText( 'Option 1 price' ) ).not.toHaveAccessibleDescription(
			'Option 2 price is bad.'
		);
	} );

	it( 'Option value writes only its own key', async () => {
		// Kills: a mutant that wires the value control's `onChange` to
		// patch `label` or `price` instead of `value`.
		const { user } = await renderEditor( {
			fields: { plan: defaultField( 'select', 'plan', 'Plan' ) },
			fieldKey: 'plan',
		} );

		await user.clear( screen.getByLabelText( 'Option 1 value' ) );
		await user.type( screen.getByLabelText( 'Option 1 value' ), 'gold' );

		const original = defaultField( 'select', 'plan', 'Plan' ).options[ 0 ];

		expect( fieldsSnapshot().plan.options[ 0 ] ).toEqual( { ...original, value: 'gold' } );
	} );

	it( 'adds a new option at the end, not the start', async () => {
		// Kills: a mutant that prepends (`[ newOption, ...options ]`)
		// instead of appending.
		const { user } = await renderEditor( {
			fields: { plan: defaultField( 'select', 'plan', 'Plan' ) },
			fieldKey: 'plan',
		} );

		await user.clear( screen.getByLabelText( 'Option 1 label' ) );
		await user.type( screen.getByLabelText( 'Option 1 label' ), 'Original' );

		await user.click( screen.getByRole( 'button', { name: 'Add option' } ) );

		expect( screen.getByLabelText( 'Option 1 label' ) ).toHaveValue( 'Original' );
		expect( screen.getByLabelText( 'Option 2 label' ) ).toHaveValue( '' );
	} );

	it( 'gives a newly added option a numeric price, not null', async () => {
		// Kills: a mutant that gives the new option `price: null` instead
		// of `price: 0` — the exact shape of the Task 9 defect. `null`
		// renders NumberControl's box empty, so `toHaveValue( 0 )` fails.
		const { user } = await renderEditor( {
			fields: { plan: defaultField( 'select', 'plan', 'Plan' ) },
			fieldKey: 'plan',
		} );

		await user.click( screen.getByRole( 'button', { name: 'Add option' } ) );

		expect( screen.getByLabelText( 'Option 2 price' ) ).toHaveValue( 0 );
	} );

	it( 'turns an emptied price into 0, not null', async () => {
		// Kills: a mutant that stores the raw (possibly `null`) value
		// instead of coercing an emptied price to `0`. Cleared and
		// asserted directly, without retyping, so a `null` regression
		// can't hide behind a later keystroke.
		const { user } = await renderEditor( {
			fields: { plan: defaultField( 'select', 'plan', 'Plan' ) },
			fieldKey: 'plan',
		} );

		await user.clear( screen.getByLabelText( 'Option 1 price' ) );

		expect( screen.getByLabelText( 'Option 1 price' ) ).toHaveValue( 0 );
		expect( fieldsSnapshot().plan.options[ 0 ].price ).toBe( 0 );
	} );

	it( 'disables Remove at exactly one option', async () => {
		// Kills: a mutant that removes the `options.length === 1` guard,
		// letting the list reach zero options (the server's
		// `empty_collection` error).
		await renderEditor( {
			fields: { plan: defaultField( 'select', 'plan', 'Plan' ) },
			fieldKey: 'plan',
		} );

		expect( screen.getByRole( 'button', { name: 'Remove option 1' } ) ).toBeDisabled();
	} );

	describe( 'with three options', () => {
		async function renderWithThreeOptions() {
			const { user } = await renderEditor( {
				fields: { plan: defaultField( 'select', 'plan', 'Plan' ) },
				fieldKey: 'plan',
			} );

			await user.click( screen.getByRole( 'button', { name: 'Add option' } ) );
			await user.click( screen.getByRole( 'button', { name: 'Add option' } ) );

			await user.clear( screen.getByLabelText( 'Option 1 label' ) );
			await user.type( screen.getByLabelText( 'Option 1 label' ), 'First' );
			await user.clear( screen.getByLabelText( 'Option 2 label' ) );
			await user.type( screen.getByLabelText( 'Option 2 label' ), 'Second' );
			await user.clear( screen.getByLabelText( 'Option 3 label' ) );
			await user.type( screen.getByLabelText( 'Option 3 label' ), 'Third' );

			return user;
		}

		it( 'moves the right option down, out of three', async () => {
			// Kills: `moveDown` was never exercised at all before.
			const user = await renderWithThreeOptions();

			await user.click( screen.getByRole( 'button', { name: 'Move option 2 down' } ) );

			expect( screen.getByLabelText( 'Option 1 label' ) ).toHaveValue( 'First' );
			expect( screen.getByLabelText( 'Option 2 label' ) ).toHaveValue( 'Third' );
			expect( screen.getByLabelText( 'Option 3 label' ) ).toHaveValue( 'Second' );
		} );

		it( 'moves the right option up, out of three', async () => {
			// Kills: `moveUp` was only ever tested on a two-element list,
			// where "the item that moved" and "the only other item" are
			// indistinguishable.
			const user = await renderWithThreeOptions();

			await user.click( screen.getByRole( 'button', { name: 'Move option 3 up' } ) );

			expect( screen.getByLabelText( 'Option 1 label' ) ).toHaveValue( 'First' );
			expect( screen.getByLabelText( 'Option 2 label' ) ).toHaveValue( 'Third' );
			expect( screen.getByLabelText( 'Option 3 label' ) ).toHaveValue( 'Second' );
		} );

		it( 'removes the named option, not the first, out of three', async () => {
			// Kills: a mutant that removes index 0 regardless of which
			// button was clicked — indistinguishable from correct
			// behaviour with only two options.
			const user = await renderWithThreeOptions();

			await user.click( screen.getByRole( 'button', { name: 'Remove option 2' } ) );

			expect( screen.getByLabelText( 'Option 1 label' ) ).toHaveValue( 'First' );
			expect( screen.getByLabelText( 'Option 2 label' ) ).toHaveValue( 'Third' );
			expect( screen.queryByLabelText( 'Option 3 label' ) ).not.toBeInTheDocument();
		} );

		it( 'disables the move buttons at both ends of the list', async () => {
			await renderWithThreeOptions();

			expect( screen.getByRole( 'button', { name: 'Move option 1 up' } ) ).toBeDisabled();
			expect( screen.getByRole( 'button', { name: 'Move option 3 down' } ) ).toBeDisabled();
			expect( screen.getByRole( 'button', { name: 'Move option 1 down' } ) ).toBeEnabled();
			expect( screen.getByRole( 'button', { name: 'Move option 3 up' } ) ).toBeEnabled();
		} );
	} );
} );

describe( 'a malformed field cannot crash the builder', () => {
	it( 'renders a select field with no options array without throwing', async () => {
		// Kills nothing by itself (this is the regression the review
		// found, not a mutant), but pins the guard against the exact
		// crash the reviewer confirmed: `options.map` on `undefined`.
		await renderEditor( {
			fields: {
				plan: { ...defaultField( 'select', 'plan', 'Plan' ), options: undefined },
			},
			fieldKey: 'plan',
		} );

		expect( screen.queryByLabelText( 'Option 1 label' ) ).not.toBeInTheDocument();
		expect( screen.getByRole( 'button', { name: 'Add option' } ) ).toBeInTheDocument();
	} );
} );
