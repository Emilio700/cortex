"""Doctor Profile Model - Stores membrete and professional information"""
from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from app.db.session import Base, utcnow


class DoctorProfile(Base):
    """
    Extended profile for doctors with professional information
    Used for PDF generation (prescriptions, certificates)
    """

    __tablename__ = "doctor_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False, index=True)
    # Fase 6.1: FK to Specialty, replacing the old free-text string column
    # (migration 2026_07_10_0001_add_specialty backfills existing values).
    specialty_id = Column(Integer, ForeignKey("specialties.id"), nullable=False)
    professional_id = Column(String(100), nullable=False)  # Cédula profesional
    phone = Column(String(50))
    clinic_address = Column(Text)
    university = Column(String(255))  # Added manually
    logo_url = Column(String(500))  # URL to logo image
    signature_url = Column(String(500))  # URL to signature image
    # ── Member fields for prescription/certificate header ──
    general_registry = Column(String(50), nullable=True)   # R.G.P.
    specialty_license = Column(String(50), nullable=True)   # Cédula Especialidad
    health_registry = Column(String(50), nullable=True)    # SSA
    council_cert = Column(String(100), nullable=True)      # Consejo/CONACEM
    # ── Configuracion de la receta (ver app/utils/receta_config.py) ──
    # Nombre tal como debe imprimirse. Independiente de users.full_name:
    # la Dra. Yara Montserrat Gutierrez Romero firma "Dra. Yara Gutierrez".
    prescription_display_name = Column(String(150), nullable=True)
    # Interruptores de que se imprime y que no. JSON y no una columna por
    # casilla: son preferencias de presentacion, nunca se consultan ni se
    # ordenan por ellas, y la lista crece cada vez que pdf.py gana un
    # elemento. Ademas en JSON el booleano se guarda como booleano, asi que
    # no puede repetirse el INTEGER que rechazo PostgreSQL en produccion.
    prescription_settings = Column(JSON, nullable=True)
    # Leyenda del pie. Editable; vacia o NULL cae a la de fabrica
    # (app/utils/receta_config.py), que es la que estaba escrita en pdf.py.
    prescription_footer_text = Column(String(150), nullable=True)
    # Color de acento del membrete (#RRGGBB). NULL = el morado de siempre.
    # De aqui se derivan la linea y los subrayados: pedirle tres colores a la
    # doctora seria pedirle que acierte tres veces.
    prescription_accent_color = Column(String(7), nullable=True)
    # Tipografia del bloque de la firma: fuente, tamano, negritas, cursiva,
    # color y si lleva linea para firmar a mano. Separada de
    # prescription_settings porque aquel es un diccionario de booleanos.
    prescription_signature_style = Column(JSON, nullable=True)
    # Configuracion propia de la orden de estudio (plan 26, D-7): modo de
    # impresion, que datos salen y la leyenda del pie. El membrete de la
    # orden es el de la receta; ver app/utils/orden_config.py.
    order_settings = Column(JSON, nullable=True)
    # Días sin resultado para que un estudio cuente como atrasado, por
    # prioridad (plan 32, punto 3). NULL = los de fábrica: 7, 15 y 30.
    plazos_atrasado = Column(JSON, nullable=True)
    # Contacto que la doctora quiere imprimir (plan 26, ronda 3), aparte del
    # correo con que entra y del teléfono del consultorio. Salen en la receta
    # y la orden sólo si ella los enciende.
    contact_email = Column(String(255), nullable=True)
    mobile_phone = Column(String(30), nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    # Relationship
    user = relationship("User", back_populates="doctor_profile")
    specialty = relationship("Specialty", back_populates="doctor_profiles")

    def __repr__(self):
        return f"<DoctorProfile(user_id={self.user_id}, specialty_id={self.specialty_id})>"
