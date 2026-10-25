# Presidio Analyzer con soporte de español (spaCy es_core_news_md) además de inglés.
FROM mcr.microsoft.com/presidio-analyzer:latest
RUN python -m spacy download es_core_news_md
COPY conf/ /presidio-conf/
ENV NLP_CONF_FILE=/presidio-conf/nlp.yaml \
    RECOGNIZER_REGISTRY_CONF_FILE=/presidio-conf/recognizers.yaml \
    ANALYZER_CONF_FILE=/presidio-conf/analyzer.yaml
