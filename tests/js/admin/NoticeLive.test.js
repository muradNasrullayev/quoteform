/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';

import Notice from '../../../admin-src/components/Notice';

describe( 'Notice live regions', () => {
	it( 'keeps its roles by default', () => {
		render(
			<>
				<Notice status="error">Broken</Notice>
				<Notice status="success">Saved</Notice>
			</>
		);

		expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Broken' );
		expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Saved' );
	} );

	it( 'is a plain box when the screen announces through its own region', () => {
		const { container } = render( <Notice status="error" live={ false }>Broken</Notice> );

		expect( screen.getByText( 'Broken' ) ).toBeInTheDocument();
		expect( container.querySelector( '[role]' ) ).toBeNull();
	} );
} );
