<?php

declare(strict_types=1);

namespace Quoteform\Engine;

final class Expression
{
    /** @var array<string, array<string, mixed>> */
    private static $cache = [];

    /**
     * @return array<string, mixed>
     */
    public static function compile( string $source ): array
    {
        // Hash yox, mənbə sətrinin özü açardır: PHP array açarları uzun sətirləri problemsiz
        // idarə edir, JS tərəfi də Map-i mənbə sətri ilə açarlayır (frontend-src/engine/compile.js).
        // Hash heç nə qazandırmır və bir collision səssizcə səhv AST-i (deməli səhv qiyməti) qaytara bilər.
        if ( ! isset( self::$cache[ $source ] ) ) {
            self::$cache[ $source ] = Parser::parse( $source );
        }

        return self::$cache[ $source ];
    }

    /**
     * @param array<string, mixed> $variables
     * @return mixed
     */
    public static function evaluate( string $source, array $variables )
    {
        return ( new Evaluator( $variables ) )->evaluate( self::compile( $source ) );
    }

    /**
     * @return string[]
     */
    public static function variables( string $source ): array
    {
        $names = [];

        self::collectVariables( self::compile( $source ), $names );

        return array_values( array_unique( $names ) );
    }

    public static function clearCache(): void
    {
        self::$cache = [];
    }

    public static function cacheSize(): int
    {
        return count( self::$cache );
    }

    /**
     * @param array<string, mixed> $node
     * @param string[]             $names
     */
    private static function collectVariables( array $node, array &$names ): void
    {
        switch ( $node['type'] ) {
            case 'var':
                $names[] = $node['name'];
                return;

            case 'unary':
                self::collectVariables( $node['operand'], $names );
                return;

            case 'binary':
                self::collectVariables( $node['left'], $names );
                self::collectVariables( $node['right'], $names );
                return;

            case 'call':
                foreach ( $node['args'] as $argument ) {
                    self::collectVariables( $argument, $names );
                }
                return;
        }
    }
}
