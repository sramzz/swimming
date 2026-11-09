import { describe, it, expect } from 'vitest';
import { parseZwemwaterSpotDetailHtml } from '../../src/ingestion/zwemwater-detail-parser';

const SAMPLE_SPOT_118_HTML = `
<article class="spot ">
<header class="spot-header warning">
	<a href="#" class="close-panel"></a>
	<p class="spot-status">Er geldt een waarschuwing</p>
	<h3 class="spot-name">Haaksbergen, Camping 'T Stepelerven</h3>
	<div class="spot-meta">
		<div class="spot-recent_measurement">Recent gecontroleerd</div>
		<div class="spot-entrance_fee">SEMI_OPENBAAR BETAALD</div>
		<div class="spot-water_quality_last_4_year">De zwemwaterkwaliteit de afgelopen 4 jaar is  uitstekend</div>
		<div class="spot-location_owner_info">Waterschap Vechtstromen</div>
	</div>
	<p class="spot-description">De vijver op het terrein van camping Stepelerveld heeft een oppervlakte van circa 0,7 ha en heeft een maximale diepte van 2,3 meter.</p>
</header>
<div class="tabs-panel is-active" id="panel-1">
	<p class="spot-location_owner_info">Het badseizoen op deze zwemlocatie loopt van 1-5 tot 30-9. Buiten deze periode wordt de zwemlocatie niet gecontroleerd door de provincie. Heeft u vragen of opmerkingen neem dan contact op met de provincie via onderstaande gegevens: Provincie Overijssel, 038 499 88 99, overijsselloket@overijssel.nl.</p>
	<a target="_blank" class="button hollow expanded" href="https://register.zwemwater.nl/zwr/api/files/58a10261-106e-4187-b15a-cf7ef59ed537">Zwemwaterprofiel</a>
</div>
<div class="tabs-panel" id="panel-2">
	<h4>Faciliteiten</h4>
	<ul class="feature-list">
		<li class="spot-feature wc-toiletten">WC / Toiletten</li>
		<li class="spot-feature honden-niet-toegestaan">Honden niet toegestaan</li>
		<li class="spot-feature horeca">Horeca</li>
		<li class="spot-feature parkeerplaats">Parkeerplaats</li>
		<li class="spot-feature zandstrand">Zandstrand</li>
		<li class="spot-feature speelweide">Speelweide</li>
		<li class="spot-feature zwemzone-afgebakend">Zwemzone afgebakend</li>
		<li class="spot-feature drijflijn">Drijflijn</li>
		<li class="spot-feature toezicht-categorie-c">Toezicht categorie c</li>
		<li class="spot-feature zoet-water">Zoet water</li>
	</ul>
</div>
<div class="tabs-panel" id="panel-3">
	<a target="_blank" class="button hollow expanded" href="https://register.zwemwater.nl/zwr/api/files/223a27bb-9d4f-4484-8f30-79a7aa7acbd4">Informatiebord</a>
	<a target="_blank" class="button hollow expanded" href="https://register.zwemwater.nl/zwr/api/files/11111111-2222-3333-4444-555555555555">Foto1</a>
</div>
<div class="tabs-panel" id="panel-4">
	<h4>Waarschuwingen</h4>
	<ul class="warning-list">
		<li class="spot-warning">
			<h5>Er geldt een waarschuwing vanaf 30-04-2026</h5>
			<p>Waarschuwing vanwege blauwalgen. Zwemmen wordt ontraden vanwege huidirritatie en maag-/darmklachten.</p>
		</li>
	</ul>
</div>
</article>
`;

describe('Phase 3 (Task 7.7): Zwemwater.nl Per-Spot Detail Parser', () => {
  it('parses entrance fee, 4-year EU water quality, season, restrictions, infoBoardUrl, officialPhotoUrls, and warnings', () => {
    const parsed = parseZwemwaterSpotDetailHtml(118, SAMPLE_SPOT_118_HTML);

    expect(parsed.spotid).toBe(118);
    expect(parsed.statusTextNl).toBe('Er geldt een waarschuwing');
    expect(parsed.recentMeasurementStatusNl).toBe('Recent gecontroleerd');
    expect(parsed.entranceFeeCode).toBe('SEMI_OPENBAAR BETAALD');
    expect(parsed.isPaidAccess).toBe(true);
    expect(parsed.waterQuality4YearClassNl).toBe('uitstekend');
    expect(parsed.locationOwnerNl).toBe('Waterschap Vechtstromen');
    expect(parsed.descriptionNl).toContain('camping Stepelerveld');
    expect(parsed.seasonTextNl).toContain('1-5 tot 30-9');
    expect(parsed.waterProfileUrl).toBe(
      'https://register.zwemwater.nl/zwr/api/files/58a10261-106e-4187-b15a-cf7ef59ed537'
    );
    expect(parsed.infoBoardUrl).toBe(
      'https://register.zwemwater.nl/zwr/api/files/223a27bb-9d4f-4484-8f30-79a7aa7acbd4'
    );
    expect(parsed.officialPhotoUrls).toEqual([
      'https://register.zwemwater.nl/zwr/api/files/11111111-2222-3333-4444-555555555555',
    ]);
    expect(parsed.restrictionsNl).toContain('Honden niet toegestaan');
    expect(parsed.featuresNl).toContain('WC / Toiletten');
    expect(parsed.featuresNl).toContain('Zwemzone afgebakend');
    expect(parsed.warnings).toHaveLength(1);
    expect(parsed.warnings[0]?.titleNl).toContain('30-04-2026');
    expect(parsed.warnings[0]?.bodyNl).toContain('blauwalgen');
  });

  it('parses the live 2026 Zwemwater.nl WordPress theme markup (spotid=38739 Camping Wedderbergen)', () => {
    const liveHtml = `
      <div class="status"><div class="status-text alert"><i class="fa-regular fa-circle-exclamation"></i>Let op: kans op gezondheidsklachten</div></div>
      <ul class="spot-info">
        <li class="spot-address"><span>Adres:</span> Wedderbergenweg , Wedde</li>
        <li class="spot-recent_measurement_status"><span>Actuele situatie:</span> Waarschuwing</li>
        <li class="spot-entrance_fee"><span>Toegang:</span> alleen voor campinggasten</li>
        <li class="spot-water_quality_last_4_year"><span>Waterkwaliteit in de laatste vier jaar:</span> <a href="#">goed</a></li>
        <li class="spot-location_owner_info"><span>Locatiebeheerder:</span> <div>Provincie Groningen, 050-31 64 911</div></li>
      </ul>
      <h3 class="h5">Informatie</h3>
      <p>De recreatieplas Wedderbergen is gelegen te Wedderveer.</p>
      <p>Het seizoen bij deze zwemplek loopt van 1-5 tot 30-9<br><strong> Uitgebreide informatie: </strong><a href="https://register.zwemwater.nl/zwr/api/files/302369" target="_blank">Zwemwaterprofiel Wedderbergen</a></p>
      <ul class="features">
        <li class="spot-feature honden-niet-toegestaan">
          <span class="tooltip-shortcode-wrapper">
            <button><span>honden-niet-toegestaan</span></button>
            <span class="tooltip-span" role="tooltip">Honden niet toegestaan</span>
          </span>
        </li>
      </ul>
      <div class="gallery-block">
        <a href="https://register.zwemwater.nl/zwr/api/files/372689" class="gallery-item" target="_blank"> Informatiebord</a>
        <a href="https://register.zwemwater.nl/zwr/api/files/999999" class="gallery-item" target="_blank"> Foto1</a>
      </div>
      <div id="panel-4">
        <ul class="warning-list">
          <li><span class="status-description"><span class="bold">Waarschuwing (vanaf 13-07-2026)</span><br><small>Waarschuwing voor blauwalgen. Kans op huidirritatie en maag-/darmklachten.<br></small></span></li>
        </ul>
      </div>
    `;
    const parsed = parseZwemwaterSpotDetailHtml(38739, liveHtml);
    expect(parsed.statusTextNl).toBe('Let op: kans op gezondheidsklachten');
    expect(parsed.recentMeasurementStatusNl).toBe('Waarschuwing');
    expect(parsed.entranceFeeCode).toBe('alleen voor campinggasten');
    expect(parsed.isPaidAccess).toBe(true);
    expect(parsed.waterQuality4YearClassNl).toBe('goed');
    expect(parsed.locationOwnerNl).toContain('Provincie Groningen');
    expect(parsed.descriptionNl).toContain('recreatieplas Wedderbergen');
    expect(parsed.seasonTextNl).toContain('1-5 tot 30-9');
    expect(parsed.waterProfileUrl).toBe('https://register.zwemwater.nl/zwr/api/files/302369');
    expect(parsed.infoBoardUrl).toBe('https://register.zwemwater.nl/zwr/api/files/372689');
    expect(parsed.officialPhotoUrls).toEqual(['https://register.zwemwater.nl/zwr/api/files/999999']);
    expect(parsed.featuresNl).toEqual(['Honden niet toegestaan']);
    expect(parsed.restrictionsNl).toEqual(['Honden niet toegestaan']);
    expect(parsed.warnings[0]?.titleNl).toBe('Waarschuwing (vanaf 13-07-2026)');
    expect(parsed.warnings[0]?.bodyNl).toContain('blauwalgen');
  });
});
