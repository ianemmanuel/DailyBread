import { prisma } from '../../index'

const ACTION_REASONS = [
    { 
        code: "POLICY_VIOLATION",    
        label: "Policy violation",         
        description: "Violated platform terms of service or operational policies.", 
        appliesTo: ["vendor_account.suspended", "outlet.suspended"] 
    },
    {   
        code: "QUALITY_ISSUES",
        label: "Quality issues",
        description: "Repeated complaints about food quality or hygiene.",            
        appliesTo: ["vendor_account.suspended", "outlet.suspended"] 
    },
    {   
        code: "SAFETY_CONCERN", 
        label: "Food safety concern",      
        description: "A food safety issue has been reported or identified.",          
        appliesTo: ["vendor_account.suspended", "meal.banned"] 
    },
    {   
        code: "FRAUDULENT_ACTIVITY", 
        label: "Fraudulent activity",      
        description: "Suspected or confirmed fraudulent behaviour.",                  
        appliesTo: ["vendor_account.suspended", "vendor_account.banned", "customer.suspended"] 
    },
    {   
        code: "DOCUMENT_ISSUES",     
        label: "Document issues",          
        description: "Documents are expired, invalid, or have not been submitted.",   
        appliesTo: ["vendor_account.suspended"] 
    },
    {   
        code: "INCOMPLETE_DOCUMENTS",
        label: "Incomplete documents",     
        description: "Required documents are missing or have not been uploaded.",     
        appliesTo: ["vendor_application.rejected"] 
    },
    {   
        code: "DOCUMENT_EXPIRED",    
        label: "Expired documents",        
        description: "One or more submitted documents have expired.",                 
        appliesTo: ["vendor_application.rejected"] 
    },
    {   
        code: "INVALID_INFORMATION", 
        label: "Invalid business info",    
        description: "Business details cannot be verified or are inconsistent.",      
        appliesTo: ["vendor_application.rejected"] 
    },
    {   
        code: "INELIGIBLE_TYPE",     
        label: "Vendor type not supported",
        description: "This vendor type is not supported in the selected country.",    
        appliesTo: ["vendor_application.rejected"] 
    },
    { 
        code: "REFUND_POLICY",       
        label: "Refund per policy",        
        description: "Refund issued per platform refund policy.",                     
        appliesTo: ["customer.refund"] },
    {   
        code: "CUSTOMER_ABUSE",      
        label: "Abusive behaviour",        
        description: "Customer engaged in abuse towards vendors, couriers, or staff.",
        appliesTo: ["customer.suspended"] },
    {   
        code: "EMPLOYMENT_ENDED",    
        label: "Employment ended",         
        description: "Team member has left the organisation.",                        
        appliesTo: ["admin_user.deactivated"] 
    },
    {   
        code: "TEMPORARY_REVIEW",    
        label: "Temporary — under review", 
        description: "Account suspended pending investigation or review.",            
        appliesTo: ["admin_user.suspended", "vendor_account.suspended"] 
    },
] as const

export async function seedActionReasons(): Promise<number> {
  for (const reason of ACTION_REASONS) {
    await prisma.adminActionReason.upsert({
      where : { code: reason.code },
      update: { label: reason.label, description: reason.description, appliesTo: [...reason.appliesTo] },
      create: { code: reason.code, label: reason.label, description: reason.description, appliesTo: [...reason.appliesTo] },
    })
  }
  return ACTION_REASONS.length
}