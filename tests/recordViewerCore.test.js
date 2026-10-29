import { describe, expect, it } from 'vitest';
import { buildRecordViewerCloneFields, buildRecordViewerPatch, canEditRecordField, formatRecordViewerSaveErrors, isRecordViewerShortcut, reconcileRecordViewerPatch, recordIdFromSalesforceUrl, recordViewerEditorType, recordViewerPicklistOptions } from '../shared/recordViewerCore.js';
import { isSfInjectIntegrationEnabled, normalizeSfInjectConfig } from '../sfInject/lib/settings.js';
import { normalizeRecordViewerShortcut } from '../sfInject/content/recordViewerShortcutUtils.js';

describe('recordViewerCore', () => {
  it('incluye el detalle de Salesforce al formatear errores de guardado', () => {
    const message = formatRecordViewerSaveErrors([
      { message: 'La regla de validación exige informar el motivo.', fields: ['Motivo__c'] },
      { message: 'La regla de validación exige informar el motivo.' },
      { body: [{ message: 'No tienes permiso para actualizar el propietario.' }] }
    ], 'No se pudieron guardar los cambios.');

    expect(message).toBe('No se pudieron guardar los cambios. La regla de validación exige informar el motivo. · No tienes permiso para actualizar el propietario.');
  });

  it('detecta Ids en Lightning y Salesforce Console', () => {
    expect(recordIdFromSalesforceUrl('https://acme.lightning.force.com/lightning/r/Account/001000000000001AAA/view')).toBe('001000000000001AAA');
    expect(recordIdFromSalesforceUrl('https://acme.lightning.force.com/one/one.app#/sObject/500000000000001AAA/view')).toBe('500000000000001AAA');
  });
  it('acepta Ctrl/Cmd+Shift+E y rechaza otros atajos', () => {
    expect(isRecordViewerShortcut({ ctrlKey:true, shiftKey:true, metaKey:false, altKey:false, key:'e' })).toBe(true);
    expect(isRecordViewerShortcut({ ctrlKey:false, shiftKey:true, metaKey:true, altKey:false, key:'E' })).toBe(true);
    expect(isRecordViewerShortcut({ ctrlKey:true, shiftKey:false, metaKey:false, altKey:false, key:'e' })).toBe(false);
  });
  it('normaliza y aplica un atajo configurable', () => {
    expect(normalizeRecordViewerShortcut(' ctrl + alt + r ')).toBe('Ctrl+Alt+R');
    expect(isRecordViewerShortcut({ ctrlKey:true, shiftKey:false, metaKey:false, altKey:true, key:'r' }, 'Ctrl+Alt+R')).toBe(true);
  });
  it('solo habilita edición con todos los permisos efectivos', () => {
    const base = { objectPermissions:{updateable:true}, recordAccess:{HasEditAccess:true}, field:{name:'Name',accessible:true,updateable:true}, orgReadOnly:false,writePolicyAllowed:true };
    expect(canEditRecordField(base).editable).toBe(true);
    expect(canEditRecordField({ ...base, field:{name:'Description',updateable:true} }).editable).toBe(true);
    expect(canEditRecordField({ ...base, recordAccess:{HasEditAccess:false} }).reason).toBe('RECORD_NOT_EDITABLE');
    expect(canEditRecordField({ ...base, recordAccess:null }).reason).toBe('RECORD_ACCESS_UNKNOWN');
    expect(canEditRecordField({ ...base, field:{...base.field,accessible:false} }).reason).toBe('FIELD_NOT_ACCESSIBLE');
    expect(canEditRecordField({ ...base, field:{...base.field, calculated:true} }).reason).toBe('FIELD_CALCULATED');
    expect(canEditRecordField({ ...base, orgReadOnly:true }).reason).toBe('ORG_READ_ONLY');
  });
  it('solo construye el payload de campos modificados autorizados', () => {
    expect(buildRecordViewerPatch([{apiName:'Name',editable:true,changed:true,pendingValue:'Nuevo'},{apiName:'Description',editable:true,changed:true,pendingValue:'Texto'},{apiName:'Secret__c',editable:false,changed:true,pendingValue:'x'},{apiName:'Id',editable:true,changed:true,pendingValue:'001'}])).toEqual({Name:'Nuevo',Description:'Texto'});
  });
  it('solo conserva campos creables al preparar un clonado', () => {
    expect(buildRecordViewerCloneFields(
      { Subject:'Consulta', Status:'New', Secret__c:'No', Formula__c:'Calculado', Id:'500000000000001AAA' },
      [
        { name:'Subject', createable:true }, { name:'Status', createable:true },
        { name:'Secret__c', createable:true, accessible:false }, { name:'Formula__c', createable:true, calculated:true },
        { name:'Id', createable:true }
      ]
    )).toEqual({ Subject:'Consulta', Status:'New' });
  });
  it('reconcilia por campo sin bloquear cambios ajenos en el registro', () => {
    expect(reconcileRecordViewerPatch(
      { Subject:'Anterior', Priority:'High' },
      { Subject:'Nuevo' },
      { Subject:'Anterior' }
    )).toEqual({ fields:{ Subject:'Nuevo' }, conflicts:[] });
  });
  it('no sobrescribe un campo modificado en la org y elimina updates ya aplicados', () => {
    expect(reconcileRecordViewerPatch(
      { Subject:'Cambio desde Salesforce', Priority:'High' },
      { Subject:'Cambio desde extensión', Priority:'High' },
      { Subject:'Anterior', Priority:'Medium' }
    )).toEqual({ fields:{}, conflicts:['Subject'] });
  });
  it('usa un selector para picklists y solo incluye valores activos', () => {
    expect(recordViewerEditorType('picklist')).toBe('list');
    expect(recordViewerEditorType('boolean')).toBe('booleanList');
    expect(recordViewerEditorType('currency')).toBe('number');
    expect(recordViewerEditorType('datetime')).toBe('datetime');
    expect(recordViewerEditorType('time')).toBe('time');
    expect(recordViewerPicklistOptions({ nillable:true, restrictedPicklist:true, picklistValues:[{label:'Abierto',value:'Open',active:true},{label:'Antiguo',value:'Old',active:false}] }, '(Vacío)')).toEqual([
      { label:'(Vacío)', value:'' },
      { label:'Abierto', value:'Open' }
    ]);
  });
  it('respeta el interruptor de la integración UI', () => {
    const enabled = normalizeSfInjectConfig({ enabled:true, integrations:{ recordViewer:true } });
    const disabled = normalizeSfInjectConfig({ enabled:true, integrations:{ recordViewer:false } });
    expect(isSfInjectIntegrationEnabled(enabled, 'recordViewer')).toBe(true);
    expect(isSfInjectIntegrationEnabled(disabled, 'recordViewer')).toBe(false);
  });
});
