<?php

declare(strict_types=1);

namespace Quoteform\Engine;

final class Token
{
    public const NUMBER   = 'number';
    public const STRING   = 'string';
    public const BOOLEAN  = 'boolean';
    public const VARIABLE = 'variable';
    public const IDENT    = 'ident';
    public const OPERATOR = 'operator';
    public const LPAREN   = 'lparen';
    public const RPAREN   = 'rparen';
    public const COMMA    = 'comma';
    public const EOF      = 'eof';

    /** @var string */
    public $type;

    /** @var mixed */
    public $value;

    /** @var int */
    public $position;

    /**
     * @param mixed $value
     */
    public function __construct( string $type, $value, int $position )
    {
        $this->type     = $type;
        $this->value    = $value;
        $this->position = $position;
    }
}
