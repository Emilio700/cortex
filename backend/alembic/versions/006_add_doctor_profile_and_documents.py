"""Add doctor_profile and patient_documents tables

Revision ID: 006_documents
Revises: d7e318a281c5
Create Date: 2026-01-24

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '006_documents'
down_revision = 'd7e318a281c5'  # Points to the last migration
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create doctor_profiles table
    op.create_table(
        'doctor_profiles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('specialty', sa.String(255), nullable=False),
        sa.Column('professional_id', sa.String(100), nullable=False),
        sa.Column('phone', sa.String(50), nullable=True),
        sa.Column('clinic_address', sa.Text(), nullable=True),
        sa.Column('logo_url', sa.String(500), nullable=True),
        sa.Column('signature_url', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_doctor_profiles_user_id', 'doctor_profiles', ['user_id'], unique=True)

    # Create patient_documents table
    op.create_table(
        'patient_documents',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('tenant_id', sa.Integer(), nullable=False),
        sa.Column('uploaded_by_user_id', sa.Integer(), nullable=False),
        sa.Column('document_type', sa.String(50), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('file_path', sa.String(500), nullable=False),
        sa.Column('file_name', sa.String(255), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('mime_type', sa.String(100), nullable=True),
        sa.Column('lab_name', sa.String(255), nullable=True),
        sa.Column('study_date', sa.String(50), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['uploaded_by_user_id'], ['users.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_patient_documents_patient_id', 'patient_documents', ['patient_id'])
    op.create_index('ix_patient_documents_tenant_id', 'patient_documents', ['tenant_id'])


def downgrade() -> None:
    op.drop_index('ix_patient_documents_tenant_id', 'patient_documents')
    op.drop_index('ix_patient_documents_patient_id', 'patient_documents')
    op.drop_table('patient_documents')
    
    op.drop_index('ix_doctor_profiles_user_id', 'doctor_profiles')
    op.drop_table('doctor_profiles')
