<?php

declare(strict_types=1);

namespace Quoteform\Engine;

use RuntimeException;

final class ExpressionException extends RuntimeException
{
    /** @var string */
    private $codeSlug;

    /** @var int */
    private $position;

    /** @var array<string, mixed> */
    private $context;

    /**
     * @param array<string, mixed> $context
     */
    public function __construct( string $codeSlug, string $message, int $position = 0, array $context = [] )
    {
        parent::__construct( $message );

        $this->codeSlug = $codeSlug;
        $this->position = $position;
        $this->context  = $context;
    }

    public function getCodeSlug(): string
    {
        return $this->codeSlug;
    }

    public function getPosition(): int
    {
        return $this->position;
    }

    /**
     * @return array<string, mixed>
     */
    public function getContext(): array
    {
        return $this->context;
    }
}
