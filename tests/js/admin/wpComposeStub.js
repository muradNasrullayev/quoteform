/**
 * `@wordpress/compose` da WordPress-in özündən gəlir və bu checkout-da
 * quraşdırılmır (`wpBlocksStub.js` ilə eyni səbəb). `useInstanceId()` WP-nin
 * öz həyata keçirməsini təkrarlayır: sayğac komponentin ÖZÜNƏ görə saxlanılır
 * və hər çağırışda artır, `useMemo` isə nömrəni komponentin ömrü boyu sabit
 * saxlayır.
 */
const { useMemo } = require( 'react' );

const instances = new WeakMap();

function createId( object ) {
	const used = instances.get( object ) || 0;

	instances.set( object, used + 1 );

	return used;
}

module.exports = {
	useInstanceId( object, prefix, preferredId ) {
		return useMemo( () => {
			if ( preferredId ) {
				return preferredId;
			}

			const id = createId( object );

			return prefix ? `${ prefix }-${ id }` : id;
		}, [ object, prefix, preferredId ] );
	},
};
