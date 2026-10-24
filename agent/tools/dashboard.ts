import { defineTool } from 'eve/tools';
import { z } from 'zod';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export default defineTool({
  description: 'Read or update the VareonHQ dashboard. Available actions: list_records (collection), save_clients, save_projects, save_tasks, save_contracts, save_posts, save_emails, save_automations (record, optional id), get_activity, get_calendar_workload (start, view), get_cash_forecast (days, scenario), generate_client_report (clientId, start, end), list_client_reports, read_action_history, request_local_undo (changeId; owner must approve), search_workspace (query, optional type), get_prospect_followups, get_prospect_followup_context (prospectId), update_prospect_followup (prospectId, update), get_today, get_client_workspace and open_client_workspace (clientId), request_record_review (collection, optional id, record, reason), request_email_send (emailId). Reviews wait for the owner in the Review queue; the assistant cannot approve them. Sends are queued for owner review. Read records before changing them. Never invent identifiers.',
  inputSchema: z.object({ action: z.string(), arguments: z.record(z.string(), z.unknown()) }),
  async execute(input) {
    const {createStore}=await import(pathToFileURL(resolve('server/store.mjs')).href);
    const {createActions}=await import(pathToFileURL(resolve('server/actions.mjs')).href);
    const store=createStore(process.env.VAREON_DATA_DIR||resolve('data'));
    try{return await createActions(store).execute(input.action,input.arguments,'Vareon agent');}finally{store.close();}
  }
});
