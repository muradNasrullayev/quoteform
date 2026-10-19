/**
 * Etiketi iki hissəyə bölür: gizli baş və görünən sonluq. `<label>`-in
 * ÜMUMİ mətni — yəni əlçatan ad — simvolu-simvoluna eyni qalır, çünki hər
 * iki hissə label-in içindədir; yalnız baş vizual olaraq gizlədilir.
 *
 * Sonluq söz sərhədində başlamalıdır: "Step 1 title" + "le" ekranda "le"
 * göstərərdi. Belə halda (və sonluq uyğun gəlmədikdə) `null` qaytarılır və
 * çağıran tam etiketi göstərir — səhv bölgüdənsə uzun etiket yaxşıdır.
 */
export function splitLabel( label, visibleLabel ) {
	if ( typeof label !== 'string' || typeof visibleLabel !== 'string' || visibleLabel === '' ) {
		return null;
	}

	if ( visibleLabel.length > label.length ) {
		return null;
	}

	const cut = label.length - visibleLabel.length;
	const hidden = label.slice( 0, cut );
	const visible = label.slice( cut );

	if ( visible.toLowerCase() !== visibleLabel.toLowerCase() ) {
		return null;
	}

	if ( hidden !== '' && ! /\s$/.test( hidden ) ) {
		return null;
	}

	return { hidden, visible };
}

export default function ControlLabel( { htmlFor, label, visibleLabel, hideLabel = false } ) {
	if ( hideLabel ) {
		return (
			<label htmlFor={ htmlFor } className="screen-reader-text" data-quoteform-hidden-label="">
				{ label }
			</label>
		);
	}

	const parts = splitLabel( label, visibleLabel );

	if ( parts === null ) {
		return <label htmlFor={ htmlFor }>{ label }</label>;
	}

	return (
		<label htmlFor={ htmlFor }>
			{ parts.hidden !== '' && <span className="screen-reader-text">{ parts.hidden }</span> }
			<span className="quoteform_label-visible">{ parts.visible }</span>
		</label>
	);
}
