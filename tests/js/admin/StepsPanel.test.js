/**
 * @jest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import StepsPanel from '../../../admin-src/panels/StepsPanel';
import { StoreProvider, useDispatch, useStore } from '../../../admin-src/state/StoreContext';
import { loadSucceeded } from '../../../admin-src/state/actions';
import { defaultField } from '../../../admin-src/state/fields';
import { indexErrors } from '../../../admin-src/state/errors';

function Harness( { fields, steps, errorIndex } ) {
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
								calculations: [],
								rules: [],
								notifications: [],
							},
						} )
					)
				}
			>
				load
			</button>
			{ schema && <StepsPanel errorIndex={ errorIndex } /> }
		</>
	);
}

async function renderPanel( { fields = {}, steps = [], errorIndex = indexErrors( [] ) } = {} ) {
	const user = userEvent.setup();

	const { container } = render(
		<StoreProvider>
			<Harness fields={ fields } steps={ steps } errorIndex={ errorIndex } />
		</StoreProvider>
	);

	await user.click( screen.getByRole( 'button', { name: 'load' } ) );

	return { user, container };
}

function stepContainers( container ) {
	return Array.from( container.querySelectorAll( '.quoteform_step' ) );
}

const rooms = defaultField( 'number', 'rooms', 'Rooms' );
const notes = defaultField( 'text', 'notes', 'Notes' );

describe( 'StepsPanel', () => {
	it( 'says so when there are no steps', async () => {
		await renderPanel();

		expect( screen.getByText( 'No steps yet. Add one to hold your fields.' ) ).toBeInTheDocument();
	} );

	it( 'adds a step', async () => {
		const { user } = await renderPanel();

		await user.click( screen.getByRole( 'button', { name: 'Add step' } ) );

		expect( screen.getByLabelText( 'Step 1 title' ) ).toHaveValue( 'New step' );
	} );

	it( 'lists the fields on a step by label', async () => {
		await renderPanel( {
			fields: { rooms, notes },
			steps: [ { key: 'step_one', title: 'One', description: '', fields: [ 'rooms' ] } ],
		} );

		expect( screen.getByText( 'Rooms (rooms)' ) ).toBeInTheDocument();
	} );

	it( 'lists unassigned fields under a heading that explains the consequence', async () => {
		await renderPanel( {
			fields: { rooms, notes },
			steps: [ { key: 'step_one', title: 'One', description: '', fields: [ 'rooms' ] } ],
		} );

		expect(
			screen.getByText( 'Not on any step — nobody can fill these in' )
		).toBeInTheDocument();
		expect( screen.getByText( 'Notes (notes)' ) ).toBeInTheDocument();
	} );

	it( 'assigns an unassigned field to a step', async () => {
		const { user } = await renderPanel( {
			fields: { rooms, notes },
			steps: [ { key: 'step_one', title: 'One', description: '', fields: [ 'rooms' ] } ],
		} );

		await user.selectOptions( screen.getByLabelText( 'Put Notes (notes) on' ), '0' );
		await user.click(
			screen.getByRole( 'button', { name: 'Put on step: Notes (notes)' } )
		);

		expect(
			screen.queryByText( 'Not on any step — nobody can fill these in' )
		).not.toBeInTheDocument();
	} );

	it( 'does not assign anything merely because the chooser changed value', async () => {
		const { user } = await renderPanel( {
			fields: { rooms, notes },
			steps: [ { key: 'step_one', title: 'One', description: '', fields: [ 'rooms' ] } ],
		} );

		await user.selectOptions( screen.getByLabelText( 'Put Notes (notes) on' ), '0' );

		expect(
			screen.getByText( 'Not on any step — nobody can fill these in' )
		).toBeInTheDocument();
		expect( screen.getByLabelText( 'Put Notes (notes) on' ) ).toBeInTheDocument();
	} );

	it( 'will not commit an assignment before a step has been chosen', async () => {
		await renderPanel( {
			fields: { rooms, notes },
			steps: [ { key: 'step_one', title: 'One', description: '', fields: [ 'rooms' ] } ],
		} );

		expect(
			screen.getByRole( 'button', { name: 'Put on step: Notes (notes)' } )
		).toBeDisabled();
	} );

	it( 'takes a field off a step', async () => {
		const { user } = await renderPanel( {
			fields: { rooms },
			steps: [ { key: 'step_one', title: 'One', description: '', fields: [ 'rooms' ] } ],
		} );

		await user.click( screen.getByRole( 'button', { name: 'Take off this step: Rooms (rooms)' } ) );

		expect(
			screen.getByText( 'Not on any step — nobody can fill these in' )
		).toBeInTheDocument();
	} );

	it( 'reorders steps', async () => {
		const { user } = await renderPanel( {
			steps: [
				{ key: 'a', title: 'First', description: '', fields: [] },
				{ key: 'b', title: 'Second', description: '', fields: [] },
			],
		} );

		await user.click( screen.getByRole( 'button', { name: 'Move step 2: Second up' } ) );

		expect( screen.getByLabelText( 'Step 1 title' ) ).toHaveValue( 'Second' );
	} );

	it( 'shows a server error against the step it belongs to', async () => {
		await renderPanel( {
			steps: [ { key: 'a', title: '', description: '', fields: [] } ],
			errorIndex: indexErrors( [
				{ path: 'steps.0.title', code: 'missing_field', message: 'A step needs a title.', context: {} },
			] ),
		} );

		expect( screen.getByLabelText( 'Step 1 title' ) ).toHaveAccessibleDescription(
			'A step needs a title.'
		);
	} );

	it( 'moves the named middle step, not the first or last, when there are three', async () => {
		const { user } = await renderPanel( {
			steps: [
				{ key: 'a', title: 'First', description: '', fields: [] },
				{ key: 'b', title: 'Middle', description: '', fields: [] },
				{ key: 'c', title: 'Third', description: '', fields: [] },
			],
		} );

		await user.click( screen.getByRole( 'button', { name: 'Move step 2: Middle down' } ) );

		expect( screen.getByLabelText( 'Step 1 title' ) ).toHaveValue( 'First' );
		expect( screen.getByLabelText( 'Step 2 title' ) ).toHaveValue( 'Third' );
		expect( screen.getByLabelText( 'Step 3 title' ) ).toHaveValue( 'Middle' );
	} );

	it( 'assigns an unassigned field to the named step among three, not just the first', async () => {
		const { user, container } = await renderPanel( {
			fields: { rooms, notes },
			steps: [
				{ key: 'a', title: 'First', description: '', fields: [] },
				{ key: 'b', title: 'Second', description: '', fields: [] },
				{ key: 'c', title: 'Third', description: '', fields: [ 'rooms' ] },
			],
		} );

		await user.selectOptions( screen.getByLabelText( 'Put Notes (notes) on' ), '1' );
		await user.click(
			screen.getByRole( 'button', { name: 'Put on step: Notes (notes)' } )
		);

		const steps = stepContainers( container );

		expect(
			screen.queryByText( 'Not on any step — nobody can fill these in' )
		).not.toBeInTheDocument();
		expect( within( steps[ 0 ] ).queryByText( 'Notes (notes)' ) ).not.toBeInTheDocument();
		expect( within( steps[ 1 ] ).getByText( 'Notes (notes)' ) ).toBeInTheDocument();
		expect( within( steps[ 2 ] ).queryByText( 'Notes (notes)' ) ).not.toBeInTheDocument();
		expect( within( steps[ 2 ] ).getByText( 'Rooms (rooms)' ) ).toBeInTheDocument();
	} );

	it( 'takes a field off the named step among three, leaving the others untouched', async () => {
		const { user, container } = await renderPanel( {
			fields: { rooms, notes },
			steps: [
				{ key: 'a', title: 'First', description: '', fields: [ 'rooms' ] },
				{ key: 'b', title: 'Second', description: '', fields: [ 'notes' ] },
				{ key: 'c', title: 'Third', description: '', fields: [] },
			],
		} );

		await user.click( screen.getByRole( 'button', { name: 'Take off this step: Notes (notes)' } ) );

		const steps = stepContainers( container );

		expect( within( steps[ 0 ] ).getByText( 'Rooms (rooms)' ) ).toBeInTheDocument();
		expect( within( steps[ 1 ] ).queryByText( 'Notes (notes)' ) ).not.toBeInTheDocument();
		expect(
			screen.getByText( 'Not on any step — nobody can fill these in' )
		).toBeInTheDocument();
		expect( screen.getByText( 'Notes (notes)' ) ).toBeInTheDocument();
	} );

	it( 'edits only the named step\'s title, leaving the other steps\' titles and descriptions untouched', async () => {
		const { user } = await renderPanel( {
			steps: [
				{ key: 'a', title: 'First', description: 'd1', fields: [] },
				{ key: 'b', title: 'Middle', description: 'd2', fields: [] },
				{ key: 'c', title: 'Third', description: 'd3', fields: [] },
			],
		} );

		await user.clear( screen.getByLabelText( 'Step 2 title' ) );
		await user.type( screen.getByLabelText( 'Step 2 title' ), 'Renamed' );

		expect( screen.getByLabelText( 'Step 1 title' ) ).toHaveValue( 'First' );
		expect( screen.getByLabelText( 'Step 3 title' ) ).toHaveValue( 'Third' );
		expect( screen.getByLabelText( 'Step 1 description' ) ).toHaveValue( 'd1' );
		expect( screen.getByLabelText( 'Step 2 description' ) ).toHaveValue( 'd2' );
		expect( screen.getByLabelText( 'Step 3 description' ) ).toHaveValue( 'd3' );
	} );

	it( 'edits only the named step\'s description, leaving that step\'s title untouched', async () => {
		const { user } = await renderPanel( {
			steps: [
				{ key: 'a', title: 'First', description: 'd1', fields: [] },
				{ key: 'b', title: 'Middle', description: 'd2', fields: [] },
				{ key: 'c', title: 'Third', description: 'd3', fields: [] },
			],
		} );

		await user.clear( screen.getByLabelText( 'Step 2 description' ) );
		await user.type( screen.getByLabelText( 'Step 2 description' ), 'Renamed' );

		expect( screen.getByLabelText( 'Step 2 title' ) ).toHaveValue( 'Middle' );
		expect( screen.getByLabelText( 'Step 1 title' ) ).toHaveValue( 'First' );
		expect( screen.getByLabelText( 'Step 3 title' ) ).toHaveValue( 'Third' );
	} );

	it( 'removes the named step via confirmation, leaving the others in order', async () => {
		const { user } = await renderPanel( {
			steps: [
				{ key: 'a', title: 'First', description: '', fields: [] },
				{ key: 'b', title: 'Middle', description: '', fields: [] },
				{ key: 'c', title: 'Third', description: '', fields: [] },
			],
		} );

		await user.click( screen.getByRole( 'button', { name: 'Remove step 2: Middle' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Remove step' } ) );

		expect( screen.getByLabelText( 'Step 1 title' ) ).toHaveValue( 'First' );
		expect( screen.getByLabelText( 'Step 2 title' ) ).toHaveValue( 'Third' );
		expect( screen.queryByLabelText( 'Step 3 title' ) ).not.toBeInTheDocument();
	} );

	it( 'gives each row\'s move and remove buttons a unique accessible name, even when titles collide', async () => {
		const { user } = await renderPanel();

		await user.click( screen.getByRole( 'button', { name: 'Add step' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Add step' } ) );

		expect(
			screen.getByRole( 'button', { name: 'Remove step 1: New step' } )
		).toBeInTheDocument();
		expect(
			screen.getByRole( 'button', { name: 'Remove step 2: New step' } )
		).toBeInTheDocument();
		expect(
			screen.getByRole( 'button', { name: 'Move step 1: New step down' } )
		).toBeInTheDocument();
		expect(
			screen.getByRole( 'button', { name: 'Move step 2: New step up' } )
		).toBeInTheDocument();
	} );

	it( 'shows the remove confirmation as an inline row, not a modal dialog', async () => {
		const { user } = await renderPanel( {
			steps: [ { key: 'a', title: 'First', description: '', fields: [] } ],
		} );

		await user.click( screen.getByRole( 'button', { name: 'Remove step 1: First' } ) );

		expect( screen.queryByRole( 'dialog' ) ).not.toBeInTheDocument();
	} );

	it( 'names the fields that will be unassigned when confirming removal of a step that has some', async () => {
		const { user } = await renderPanel( {
			fields: { rooms, notes },
			steps: [
				{ key: 'a', title: 'Middle', description: '', fields: [ 'rooms', 'notes' ] },
			],
		} );

		await user.click( screen.getByRole( 'button', { name: 'Remove step 1: Middle' } ) );

		expect(
			screen.getByText( 'Remove “Middle” and unassign its 2 fields?' )
		).toBeInTheDocument();
	} );

	it( 'moves focus to the confirm button, then back to Remove on cancel', async () => {
		const { user } = await renderPanel( {
			steps: [ { key: 'a', title: 'First', description: '', fields: [] } ],
		} );

		await user.click( screen.getByRole( 'button', { name: 'Remove step 1: First' } ) );
		expect( screen.getByRole( 'button', { name: 'Remove step' } ) ).toHaveFocus();

		await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) );
		expect( screen.getByRole( 'button', { name: 'Remove step 1: First' } ) ).toHaveFocus();
	} );

	it( 'moves focus to the field\'s Take off button after assigning it to a step', async () => {
		const { user } = await renderPanel( {
			fields: { rooms, notes },
			steps: [ { key: 'step_one', title: 'One', description: '', fields: [ 'rooms' ] } ],
		} );

		await user.selectOptions( screen.getByLabelText( 'Put Notes (notes) on' ), '0' );
		await user.click(
			screen.getByRole( 'button', { name: 'Put on step: Notes (notes)' } )
		);

		expect(
			screen.getByRole( 'button', { name: 'Take off this step: Notes (notes)' } )
		).toHaveFocus();
	} );

	it( 'moves focus to the field\'s step chooser after taking it off a step', async () => {
		const { user } = await renderPanel( {
			fields: { rooms, notes },
			steps: [ { key: 'step_one', title: 'One', description: '', fields: [ 'rooms', 'notes' ] } ],
		} );

		await user.click( screen.getByRole( 'button', { name: 'Take off this step: Notes (notes)' } ) );

		expect( screen.getByLabelText( 'Put Notes (notes) on' ) ).toHaveFocus();
	} );

	it( 'hands focus to the other move button when the one just pressed becomes disabled', async () => {
		const { user } = await renderPanel( {
			steps: [
				{ key: 'a', title: 'First', description: '', fields: [] },
				{ key: 'b', title: 'Second', description: '', fields: [] },
			],
		} );

		await user.click( screen.getByRole( 'button', { name: 'Move step 2: Second up' } ) );

		expect( screen.getByRole( 'button', { name: 'Move step 1: Second down' } ) ).toHaveFocus();
	} );

	it( 'moves focus to Add step after a removal, since that row is gone', async () => {
		const { user } = await renderPanel( {
			steps: [ { key: 'a', title: 'First', description: '', fields: [] } ],
		} );

		await user.click( screen.getByRole( 'button', { name: 'Remove step 1: First' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Remove step' } ) );

		expect( screen.getByRole( 'button', { name: 'Add step' } ) ).toHaveFocus();
	} );

	/**
	 * WCAG 2.5.3 (Label in Name). Səslə idarə edən istifadəçi düymənin
	 * ÜSTÜNDƏ YAZILAN sözləri deyir; əlçatan ad o sözləri ehtiva etmirsə,
	 * əmr düyməyə düşmür. Ona görə yoxlama tək bir düyməyə yox, panelin
	 * bütün mətnli düymələrinə baxır — növbəti aria-label də bu qaydaya
	 * düşsün deyə.
	 */
	it( 'keeps each visible button label inside that button’s accessible name', async () => {
		await renderPanel( {
			fields: { rooms, notes },
			steps: [ { key: 'step_one', title: 'One', description: '', fields: [ 'rooms' ] } ],
		} );

		// Yalnız oxdan ibarət düymələr (↑ ↓) kənarda qalır: onların görünən
		// mətni söz deyil, ona görə 2.5.3 onlara şamil edilmir. Addımın
		// sahə çipindəki ✕ "take off" düyməsi də eyni səbəbdən kənarda
		// qalır — görünən mətni ikonadır, söz deyil, ona görə WCAG 2.5.3
		// ona tətbiq olunmur; qalan sözlü düymələr (Remove step, Put on
		// step) yoxlanmağa davam edir.
		const labelled = screen
			.getAllByRole( 'button' )
			.filter(
				( button ) =>
					button.hasAttribute( 'aria-label' ) &&
					/\p{L}/u.test( button.textContent )
			);

		expect( labelled.length ).toBeGreaterThanOrEqual( 2 );

		labelled.forEach( ( button ) => {
			expect( button.getAttribute( 'aria-label' ).toLowerCase() ).toContain(
				button.textContent.trim().toLowerCase()
			);
		} );
	} );
} );
