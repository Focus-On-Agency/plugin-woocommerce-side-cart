<?php
/**
 * Sanitizes SVG markup for safe inline output.
 *
 * @package WooCommerceSideCart
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class WCSC_IconSvgSanitizer {
	/**
	 * @param mixed $markup Raw icon markup.
	 * @param bool  $disableValidation Disable sanitization.
	 * @return string
	 */
	public static function sanitizeMarkup( $markup, $disableValidation ) {
		if ( ! is_string( $markup ) ) {
			return '';
		}

		$markup = trim( $markup );
		if ( $markup === '' ) {
			return '';
		}

		if ( strpos( $markup, "\0" ) !== false ) {
			return '';
		}

		if ( $disableValidation ) {
			return $markup;
		}

		if ( function_exists( 'wp_kses' ) ) {
			return (string) wp_kses( $markup, self::allowedIconTags() );
		}

		return $markup;
	}

	/**
	 * @param mixed $svg Raw SVG markup.
	 * @return string
	 */
	public static function sanitizeSvg( $svg ) {
		return self::sanitizeMarkup( $svg, false );
	}

	/**
	 * @return array
	 */
	private static function allowedIconTags() {
		$postTags = array();
		if ( function_exists( 'wp_kses_allowed_html' ) ) {
			$postTags = wp_kses_allowed_html( 'post' );
		}
		if ( ! is_array( $postTags ) ) {
			$postTags = array();
		}
		return array_merge( $postTags, self::allowedSvgTags() );
	}

	/**
	 * @return array
	 */
	private static function allowedSvgTags() {
		return array(
			'svg' => array(
				'class' => true,
				'xmlns' => true,
				'width' => true,
				'height' => true,
				'viewbox' => true,
				'viewBox' => true,
				'fill' => true,
				'stroke' => true,
				'stroke-width' => true,
				'stroke-linecap' => true,
				'stroke-linejoin' => true,
				'stroke-miterlimit' => true,
				'stroke-dasharray' => true,
				'stroke-dashoffset' => true,
				'stroke-opacity' => true,
				'fill-opacity' => true,
				'fill-rule' => true,
				'role' => true,
				'aria-hidden' => true,
				'focusable' => true,
				'preserveaspectratio' => true,
				'preserveAspectRatio' => true,
			),
			'g' => array(
				'class' => true,
				'fill' => true,
				'stroke' => true,
				'transform' => true,
				'opacity' => true,
			),
			'path' => array(
				'class' => true,
				'd' => true,
				'fill' => true,
				'fill-rule' => true,
				'stroke' => true,
				'stroke-width' => true,
				'stroke-linecap' => true,
				'stroke-linejoin' => true,
				'stroke-miterlimit' => true,
				'stroke-dasharray' => true,
				'stroke-dashoffset' => true,
				'stroke-opacity' => true,
				'fill-opacity' => true,
				'transform' => true,
			),
			'circle' => array(
				'class' => true,
				'cx' => true,
				'cy' => true,
				'r' => true,
				'fill' => true,
				'stroke' => true,
				'stroke-width' => true,
				'transform' => true,
			),
			'rect' => array(
				'class' => true,
				'x' => true,
				'y' => true,
				'width' => true,
				'height' => true,
				'rx' => true,
				'ry' => true,
				'fill' => true,
				'stroke' => true,
				'stroke-width' => true,
				'transform' => true,
			),
			'line' => array(
				'class' => true,
				'x1' => true,
				'y1' => true,
				'x2' => true,
				'y2' => true,
				'stroke' => true,
				'stroke-width' => true,
				'stroke-linecap' => true,
				'transform' => true,
			),
			'polyline' => array(
				'class' => true,
				'points' => true,
				'fill' => true,
				'stroke' => true,
				'stroke-width' => true,
				'stroke-linecap' => true,
				'stroke-linejoin' => true,
				'transform' => true,
			),
			'polygon' => array(
				'class' => true,
				'points' => true,
				'fill' => true,
				'stroke' => true,
				'stroke-width' => true,
				'stroke-linejoin' => true,
				'transform' => true,
			),
			'defs' => array(),
			'title' => array(),
			'desc' => array(),
			'use' => array(
				'href' => true,
				'xlink:href' => true,
			),
			'lineargradient' => array(
				'id' => true,
				'x1' => true,
				'y1' => true,
				'x2' => true,
				'y2' => true,
				'gradientunits' => true,
				'gradienttransform' => true,
			),
			'radialgradient' => array(
				'id' => true,
				'cx' => true,
				'cy' => true,
				'r' => true,
				'fx' => true,
				'fy' => true,
				'gradientunits' => true,
				'gradienttransform' => true,
			),
			'stop' => array(
				'offset' => true,
				'stop-color' => true,
				'stop-opacity' => true,
			),
			'clippath' => array(
				'id' => true,
				'clippathunits' => true,
			),
			'mask' => array(
				'id' => true,
				'maskunits' => true,
				'maskcontentunits' => true,
				'x' => true,
				'y' => true,
				'width' => true,
				'height' => true,
			),
		);
	}
}
