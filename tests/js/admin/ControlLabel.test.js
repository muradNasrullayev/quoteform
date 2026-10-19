/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';

import ControlLabel, { splitLabel } from '../../../admin-src/components/ControlLabel';
import FormulaEditor from '../../../admin-src/panels/FormulaEditor';
import NumberControl from '../../../admin-src/components/NumberControl';
import SelectControl from '../../../admin-src/components/SelectControl';
import TextControl from '../../../admin-src/components/TextControl';
import ToggleControl from '../../../admin-src/components/ToggleControl';

// Görünən, `.screen-reader-text`-dən kənar mətn.
const visibleText = ( label ) =>
	Array.from( label.childNodes )
		.filter( ( node ) => ! ( node.classList && node.classList.contains( 'screen-reader-text' ) ) )
		.map( ( node ) => node.textContent )
		.join( '' );

describe( 'splitLabel', () => {
	it( 'splits a label into a hidden head and a visible tail', () => {
		expect( splitLabel( 'Calculation 1 key', 'key' ) ).toEqual( { hidden: 'Calculation 1 ', visible: 'key' } );
	} );

	it( 'matches the tail case-insensitively but keeps the label\'s own letters', () => {
		expect( splitLabel( 'Step 2 title', 'Title' ) ).toEqual( { hidden: 'Step 2 ', visible: 'title' } );
	} );

	it( 'refuses a tail that starts in the middle of a word', () => {
		expect( splitLabel( 'Step 1 title', 'le' ) ).toBeNull();
	} );

	it( 'refuses a tail that is not a tail at all', () => {
		expect( splitLabel( 'Show calculation 1 to the visitor', 'Show to visitor' ) ).toBeNull();
	} );

	it( 'has nothing to split without a visible label', () => {
		expect( splitLabel( 'Currency', undefined ) ).toBeNull();
		expect( splitLabel( 'Currency', '' ) ).toBeNull();
	} );

	it( 'survives a label that is not a string', () => {
		expect( splitLabel( undefined, 'key' ) ).toBeNull();
		expect( splitLabel( 42, '2' ) ).toBeNull();
	} );
} );

describe( 'ControlLabel', () => {
	it( 'keeps the full accessible name when only the tail is shown', () => {
		render(
			<>
				<ControlLabel htmlFor="k" label="Calculation 1 key" visibleLabel="Key" />
				<input id="k" />
			</>
		);

		const input = screen.getByLabelText( 'Calculation 1 key' );
		const label = document.querySelector( 'label[for="k"]' );

		expect( input ).toHaveAttribute( 'id', 'k' );
		expect( visibleText( label ) ).toBe( 'key' );
	} );

	it( 'shows the whole label when the tail does not fit', () => {
		render(
			<>
				<ControlLabel htmlFor="t" label="Step 1 title" visibleLabel="le" />
				<input id="t" />
			</>
		);

		expect( visibleText( document.querySelector( 'label[for="t"]' ) ) ).toBe( 'Step 1 title' );
	} );

	it( 'hides the whole label, but keeps it, when asked to', () => {
		render(
			<>
				<ControlLabel htmlFor="r" label="Rule 1 action" hideLabel />
				<select id="r" />
			</>
		);

		const label = document.querySelector( 'label[for="r"]' );

		expect( screen.getByLabelText( 'Rule 1 action' ) ).toHaveAttribute( 'id', 'r' );
		expect( label ).toHaveClass( 'screen-reader-text' );
		expect( label ).toHaveAttribute( 'data-quoteform-hidden-label' );
	} );
} );

describe( 'the controls pass the new props through', () => {
	const noop = () => {};

	it( 'TextControl', () => {
		render( <TextControl id="a" label="Step 1 title" visibleLabel="Title" value="" onChange={ noop } /> );

		expect( screen.getByLabelText( 'Step 1 title' ) ).toHaveAttribute( 'id', 'a' );
		expect( visibleText( document.querySelector( 'label[for="a"]' ) ) ).toBe( 'title' );
	} );

	it( 'SelectControl', () => {
		render(
			<SelectControl id="b" label="Rule 1 match" hideLabel value="all" onChange={ noop } options={ [ { value: 'all', label: 'All' } ] } />
		);

		expect( screen.getByLabelText( 'Rule 1 match' ) ).toHaveAttribute( 'id', 'b' );
		expect( document.querySelector( 'label[for="b"]' ) ).toHaveClass( 'screen-reader-text' );
	} );

	it( 'NumberControl', () => {
		render( <NumberControl id="c" label="Option 1 price" visibleLabel="Price" value={ 1 } onChange={ noop } /> );

		expect( screen.getByLabelText( 'Option 1 price' ) ).toHaveAttribute( 'id', 'c' );
	} );

	it( 'ToggleControl', () => {
		render( <ToggleControl id="d" label="Required" checked={ false } onChange={ noop } /> );

		expect( screen.getByLabelText( 'Required' ) ).toHaveAttribute( 'id', 'd' );
	} );

	it( 'FormulaEditor', () => {
		render(
			<FormulaEditor
				id="e"
				label="Calculation 1 formula"
				visibleLabel="Formula"
				value="1"
				onChange={ noop }
				knownVariables={ [] }
				priceVariables={ [] }
				errors={ [] }
			/>
		);

		expect( screen.getByLabelText( 'Calculation 1 formula' ) ).toHaveAttribute( 'id', 'e' );
		expect( visibleText( document.querySelector( 'label[for="e"]' ) ) ).toBe( 'formula' );
	} );
} );
