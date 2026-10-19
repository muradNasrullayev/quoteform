import { __, _n, sprintf } from '@wordpress/i18n';

/**
 * Sayğac və problem düymənin ADINA yox, TƏSVİRİNƏ gedir: testlər və səslə
 * idarə edən istifadəçilər tabı "Fields" adı ilə tapır, "Fields 11" ilə yox.
 */
export function describeTab( { count, hasProblem } ) {
	const parts = [];

	if ( typeof count === 'number' ) {
		parts.push(
			sprintf(
				/* translators: %d: how many items this builder section holds. */
				_n( '%d item', '%d items', count, 'quoteform' ),
				count
			)
		);
	}

	if ( hasProblem ) {
		parts.push(
			parts.length > 0
				? __( 'has a problem', 'quoteform' )
				: __( 'Has a problem', 'quoteform' )
		);
	}

	return parts.join( ', ' );
}

export default function SectionNav( { label, tabs, current, onSelect } ) {
	return (
		<nav className="quoteform_sections" aria-label={ label }>
			<ul>
				{ tabs.map( ( tab ) => {
					const description = describeTab( tab );
					const descriptionId = `quoteform_section-${ tab.name }-description`;

					return (
						<li key={ tab.name }>
							<button
								type="button"
								className="quoteform_sections__tab"
								onClick={ () => onSelect( tab.name ) }
								aria-current={ current === tab.name ? 'page' : undefined }
								aria-describedby={ description ? descriptionId : undefined }
							>
								<span className="quoteform_sections__label">{ tab.label }</span>
								{ tab.hasProblem && (
									<span className="quoteform_sections__dot" aria-hidden="true" />
								) }
								{ typeof tab.count === 'number' && (
									<span className="quoteform_sections__count" aria-hidden="true">
										{ tab.count }
									</span>
								) }
							</button>
							{ description && (
								<span id={ descriptionId } className="screen-reader-text">
									{ description }
								</span>
							) }
						</li>
					);
				} ) }
			</ul>
		</nav>
	);
}
