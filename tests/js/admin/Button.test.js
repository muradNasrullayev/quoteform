/**
 * @jest-environment jsdom
 */
import { createRef } from '@wordpress/element';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Button from '../../../admin-src/components/Button';
import Card from '../../../admin-src/components/Card';

describe( 'Button', () => {
	it( 'is a plain button by default, so it never submits a surrounding form', () => {
		render( <Button>Save</Button> );

		expect( screen.getByRole( 'button', { name: 'Save' } ) ).toHaveAttribute( 'type', 'button' );
	} );

	it( 'carries its variant as a class', () => {
		render( <Button variant="danger">Remove</Button> );

		const button = screen.getByRole( 'button', { name: 'Remove' } );

		expect( button ).toHaveClass( 'quoteform_button', 'quoteform_button--danger' );
	} );

	it( 'defaults to the secondary variant', () => {
		render( <Button>Cancel</Button> );

		expect( screen.getByRole( 'button', { name: 'Cancel' } ) ).toHaveClass( 'quoteform_button--secondary' );
	} );

	it( 'hands its ref to the real button, because screens move focus with it', () => {
		const ref = createRef();

		render( <Button ref={ ref }>Save</Button> );

		expect( ref.current ).toBe( screen.getByRole( 'button', { name: 'Save' } ) );
	} );

	it( 'passes through aria attributes, disabled and clicks', async () => {
		const onClick = jest.fn();

		render(
			<Button aria-label="Back to all forms" onClick={ onClick } className="extra">
				Forms
			</Button>
		);

		const button = screen.getByRole( 'button', { name: 'Back to all forms' } );

		expect( button ).toHaveClass( 'extra' );
		await userEvent.click( button );
		expect( onClick ).toHaveBeenCalledTimes( 1 );
	} );
} );

describe( 'Card', () => {
	it( 'wraps its children in a card', () => {
		render( <Card data-testid="card">hello</Card> );

		expect( screen.getByTestId( 'card' ) ).toHaveClass( 'quoteform_card' );
		expect( screen.getByTestId( 'card' ) ).toHaveTextContent( 'hello' );
	} );
} );
