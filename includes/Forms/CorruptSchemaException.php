<?php

declare(strict_types=1);

namespace Quoteform\Forms;

use RuntimeException;

/**
 * Thrown by `SchemaRepository::find()` when a form's `_qform_schema` post meta
 * holds something other than an array.
 *
 * This is a distinct state from "no schema stored" (`find()` still returns
 * `null` for that). A non-array value is a recoverable-but-unreadable schema —
 * a truncated `maybe_unserialize()`, a bad migration, a third-party meta write,
 * a partially-failed update. `FormsController::getItem()` must not treat this
 * the same as "absent": serving `SchemaRepository::defaults()` here would let
 * the builder overwrite the still-recoverable stored value with a pristine
 * default the moment the user presses Save.
 */
final class CorruptSchemaException extends RuntimeException
{
    /** @var int */
    private $formId;

    public function __construct( int $formId )
    {
        parent::__construct( sprintf( 'Form %d has a corrupt (non-array) schema in post meta.', $formId ) );

        $this->formId = $formId;
    }

    public function getFormId(): int
    {
        return $this->formId;
    }
}
