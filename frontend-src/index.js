import './style.scss';

import { createForm } from './dom/form';

// Hansı konteynerin artıq qurulduğu yadda saxlanılır. `boot()` təkrar çağırıla
// bilər (aşağıya bax), eyni konteyneri ikinci dəfə qurmaq isə hər dinləyicini
// ikiqat edər, ziyarətçinin yazdığını silər və iki nəzarət dəsti qoyardı.
// WeakMap-dir, çünki DOM-dan çıxarılan konteyner heç nə tələb etmədən unudulsun.
const mounted = new WeakMap();

export function bootAll( root ) {
	const containers = ( root || document ).querySelectorAll( '[data-quoteform]' );
	const started = [];

	containers.forEach( ( container ) => {
		if ( mounted.has( container ) ) {
			return;
		}

		const id = container.getAttribute( 'data-quoteform' );
		const schema = ( window.quoteformData || {} )[ id ];

		if ( ! schema ) {
			return;
		}

		try {
			const form = createForm( container, schema );
			const instance = {
				...form,
				destroy() {
					mounted.delete( container );
					form.destroy();
				},
			};

			mounted.set( container, instance );
			started.push( instance );
		} catch ( error ) {
			// eslint-disable-next-line no-console
			console.error( '[quoteform]', error );
		}
	} );

	return started;
}

// Səhifə yükləndikdən SONRA gələn forma — page builder popup-u, AJAX ilə açılan
// tab, sonsuz sürüşən arxiv — heç vaxt qurulmurdu və heç bir xəta da vermirdi:
// ziyarətçi boş bir sahə görürdü (`<noscript>` da kömək etmir, çünki JavaScript
// AÇIQDIR). Bu, həmin halın yeganə çıxış yoludur: `window.quoteform.boot()`.
// Təkrar çağırış təhlükəsizdir — artıq qurulmuş konteyner ötürülür.
window.quoteform = window.quoteform || {};
window.quoteform.boot = ( root ) => bootAll( root || document );

// Skript footer-dədir, ona görə adi və `defer` yükləmə hər ikisi
// `DOMContentLoaded`-dan əvvəl icra olunur. Lakin optimallaşdırma plugin-i ona
// `async` əlavə edə bilər və o zaman skript hadisədən SONRA işə düşür — hadisə
// isə bir daha gəlmir. `readyState` yoxlanışı məhz o halı tutur.
if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', () => {
		bootAll( document );
	} );
} else {
	bootAll( document );
}
