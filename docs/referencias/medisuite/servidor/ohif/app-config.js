/** OHIF v3 — configuración para MediSuite + Orthanc (a través del proxy con CORS).
 *  Las URL las usa el NAVEGADOR: si accedes desde otro equipo cambia "localhost" por la IP
 *  o el dominio del servidor (y usa HTTPS en producción). */
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
        wadoUriRoot: 'http://localhost:8080/orthanc/wado',
        qidoRoot: 'http://localhost:8080/orthanc/dicom-web',
        wadoRoot: 'http://localhost:8080/orthanc/dicom-web',
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
