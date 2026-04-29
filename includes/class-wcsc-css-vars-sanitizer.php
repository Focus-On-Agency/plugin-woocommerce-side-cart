<?php
/**
 * Sanitizes CSS variables used to generate inline style.
 *
 * @package WooCommerceSideCart
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class WCSC_CssVarsSanitizer {
	/**
	 * @param mixed $config Plugin config.
	 * @return string
	 */
	public function buildInlineStyle( $config ) {
		if ( ! is_array( $config ) || ! isset( $config['cssVars'] ) || ! is_array( $config['cssVars'] ) ) {
			return '';
		}

		$declarations = array();
		foreach ( $config['cssVars'] as $name => $value ) {
			if ( ! is_string( $name ) ) {
				continue;
			}
			$name = trim( $name );
			if ( $name === '' || strpos( $name, '--wcsc-' ) !== 0 ) {
				continue;
			}
			if ( ! preg_match( '/^--wcsc-[a-z0-9_-]+$/', $name ) ) {
				continue;
			}

			$cssValue = $this->sanitizeCssValue( $value );
			if ( $cssValue === '' ) {
				continue;
			}
			$declarations[] = $name . ':' . $cssValue . ';';
		}

		if ( empty( $declarations ) ) {
			return '';
		}

		return '.side-cart{' . implode( '', $declarations ) . '}';
	}

	/**
	 * @param mixed $value CSS value.
	 * @return string
	 */
	private function sanitizeCssValue( $value ) {
		if ( is_numeric( $value ) ) {
			$value = (string) $value;
		}

		if ( ! is_string( $value ) ) {
			return '';
		}

		$value = trim( $value );
		if ( $value === '' ) {
			return '';
		}

		// Deterministic hardening: block delimiters and HTML.
		if ( preg_match( '/[;{}<>]/', $value ) ) {
			return '';
		}

		// Disallow url() to avoid SSRF/tracking vectors in inline CSS vars.
		if ( stripos( $value, 'url(' ) !== false ) {
			return '';
		}

		// Allow only a conservative character set.
		if ( ! preg_match( '/^[a-zA-Z0-9#(),.%\s\-\+\/]*$/', $value ) ) {
			return '';
		}

		return $value;
	}
}

