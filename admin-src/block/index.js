import { registerBlockType } from '@wordpress/blocks';

import metadata from '../../includes/Rendering/block.json';
import Edit from './Edit';
import './style.scss';

/**
 * Yalnız ad ötürülür. Başlıq, ikon və atributlar server tərəfdən gəlir —
 * WordPress qeyd olunmuş blokun `block.json` məlumatlarını redaktora
 * `unstable__bootstrapServerSideBlockDefinitions()` ilə ötürür və orada
 * başlıq ARTIQ tərcümə olunmuş olur. Burada təkrar versək, tərcümə
 * olunmamış ingilis mətn onu üstələyərdi.
 */
registerBlockType( metadata.name, { edit: Edit } );
