import { __, sprintf } from '@wordpress/i18n';

export const PER_PAGE_CHOICES = [ 20, 50, 100 ];

/**
 * 250 səhifəlik siyahı 250 düymə çəkməsin: ilk, son və cari ±2. Aradakı
 * boşluq yalnız bir nömrədirsə, "…" əvəzinə həmin nömrə göstərilir.
 */
export function pageWindow( page, pages ) {
	const numbers = [];

	for ( let number = 1; number <= pages; number += 1 ) {
		if ( number === 1 || number === pages || Math.abs( number - page ) <= 2 ) {
			numbers.push( number );
		}
	}

	const result = [];

	numbers.forEach( ( number, index ) => {
		const previous = numbers[ index - 1 ];

		if ( index > 0 && number - previous === 2 ) {
			result.push( previous + 1 );
		} else if ( index > 0 && number - previous > 2 ) {
			result.push( 'gap' );
		}

		result.push( number );
	} );

	return result;
}

export default function Pagination( { page, pages, perPage, onPage, onPerPage } ) {
	const choices = PER_PAGE_CHOICES.includes( perPage )
		? PER_PAGE_CHOICES
		: [ ...PER_PAGE_CHOICES, perPage ].sort( ( a, b ) => a - b );

	return (
		<div className="quoteform_entries__pagination">
			{ pages > 1 && (
				<nav className="quoteform_list__pages" aria-label={ __( 'Entry list pages', 'quoteform' ) }>
					<button
						type="button"
						onClick={ () => onPage( page - 1 ) }
						disabled={ page <= 1 }
						aria-label={ __( 'Previous page', 'quoteform' ) }
					>
						<span aria-hidden="true">‹</span>
					</button>
					{ pageWindow( page, pages ).map( ( item, index ) =>
						item === 'gap' ? (
							<span key={ `gap-${ index }` } className="quoteform_entries__gap" aria-hidden="true">
								…
							</span>
						) : (
							<button
								key={ item }
								type="button"
								onClick={ () => onPage( item ) }
								aria-current={ item === page ? 'page' : undefined }
								aria-label={ sprintf(
									/* translators: 1: page number. 2: how many pages there are. */
									__( 'Page %1$d of %2$d', 'quoteform' ),
									item,
									pages
								) }
							>
								{ item }
							</button>
						)
					) }
					<button
						type="button"
						onClick={ () => onPage( page + 1 ) }
						disabled={ page >= pages }
						aria-label={ __( 'Next page', 'quoteform' ) }
					>
						<span aria-hidden="true">›</span>
					</button>
				</nav>
			) }
			<label className="quoteform_entries__per-page">
				{ __( 'Per page', 'quoteform' ) }
				<select value={ perPage } onChange={ ( event ) => onPerPage( Number( event.target.value ) ) }>
					{ choices.map( ( choice ) => (
						<option key={ choice } value={ choice }>
							{ choice }
						</option>
					) ) }
				</select>
			</label>
		</div>
	);
}
