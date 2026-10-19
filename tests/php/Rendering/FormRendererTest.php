<?php

declare(strict_types=1);

namespace Quoteform\Tests\Rendering;

use PHPUnit\Framework\TestCase;
use Quoteform\Rendering\FormRenderer;

final class FormRendererTest extends TestCase
{
    public function testRendersAContainerCarryingTheFormId(): void
    {
        $html = FormRenderer::container( 12 );

        $this->assertStringContainsString( 'data-quoteform="12"', $html );
        $this->assertStringContainsString( 'class="quoteform_form"', $html );
    }

    public function testRendersANoScriptFallbackThatSaysSomethingUseful(): void
    {
        $html = FormRenderer::container( 12 );

        $this->assertStringContainsString( '<noscript>', $html );
        $this->assertStringContainsString( 'JavaScript', $html );
    }

    public function testEscapesTheFormIdRatherThanTrustingIt(): void
    {
        $html = FormRenderer::container( 0 );

        $this->assertStringContainsString( 'data-quoteform="0"', $html );
        $this->assertStringNotContainsString( '<script', $html );
    }

    public function testTwoFormsProduceDistinctContainerIds(): void
    {
        $this->assertNotSame(
            FormRenderer::container( 12 ),
            FormRenderer::container( 13 )
        );
    }
}
