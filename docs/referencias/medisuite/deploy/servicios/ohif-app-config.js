/** OHIF v3 para producción (perfil "servicios" + deploy/caddy/extra/ohif.caddy).
 *  OHIF se sirve en https://OHIF_DOMINIO y Orthanc en el MISMO origen bajo /orthanc (sin CORS). */
const ORTHANC = window.location.origin + '/orthanc';
window.config = {
  routerBasename: '/',
  showStudyList: true,
  extensions: [],
  modes: [],
  showWarningMessageForCrossOrigin: false,
  showCPUFallbackMessage: true,
  showLoadingIndicator: true,
  strictZSpacingForVolumeViewport: true,
  defaultDataSourceName: 'orthanc',
  dataSources: [
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'orthanc',
      configuration: {
        friendlyName: 'Orthanc MediSuite',
        name: 'orthanc',
        wadoUriRoot: ORTHANC + '/wado',
        qidoRoot: ORTHANC + '/dicom-web',
        wadoRoot: ORTHANC + '/dicom-web',
        qidoSupportsIncludeField: false,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: false,
        supportsWildcard: true,
        dicomUploadEnabled: true,
        omitQuotationForMultipartRequest: true,
        bulkDataURI: { enabled: true, relativeResolution: 'studies' },
      },
    },
  ],
};
