use serde::{Deserialize, Serialize};
use chrono::{DateTime, Local, NaiveDateTime};
use active_win_pos_rs::get_active_window;
use regex::Regex;
use std::path::PathBuf;
use std::fs;
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityItem {
    pub from: String,
    pub to: String,
    pub application_name: String,
    pub related_issue_id: Option<String>,
    pub category: String,
    pub issue_identified_by: String,
}

#[derive(Clone)]
pub struct ActivityTracker {
    current_activity: Arc<Mutex<Option<CurrentActivity>>>,
    config: Arc<Mutex<TrackerConfig>>,
}

#[derive(Debug, Clone)]
struct CurrentActivity {
    start_time: DateTime<Local>,
    app_name: String,
    title: String,
    issue_id: Option<String>,
    identified_by: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct TrackerConfig {
    pub ticket_patterns: Vec<String>,
    #[serde(skip)]
    pub storage_dir: PathBuf,
}

impl Default for TrackerConfig {
    fn default() -> Self {
        let mut patterns = Vec::new();
        // Define your regex patterns here.
        // The default pattern looks for "#" followed by digits, capturing the digits.
        patterns.push(r"#(\d+)".to_string()); 
        
        // Default storage in Documents/ActivityLogs or similar
        // For now we will resolve it at runtime or let it be configured
        Self {
            ticket_patterns: patterns,
            storage_dir: dirs::document_dir().unwrap_or(PathBuf::from(".")).join("ActivityLogs"),
        }
    }
}

impl ActivityTracker {
    pub fn new() -> Self {
        let mut config = TrackerConfig::default();
        // Ensure storage dir exists
        if !config.storage_dir.exists() {
            let _ = fs::create_dir_all(&config.storage_dir);
        }

        // Try to load config.json
        let config_path = config.storage_dir.join("config.json");
        if config_path.exists() {
            if let Ok(content) = fs::read_to_string(&config_path) {
                if let Ok(loaded) = serde_json::from_str::<TrackerConfig>(&content) {
                    config.ticket_patterns = loaded.ticket_patterns;
                }
            }
        } else {
            // Save default config
             if let Ok(json) = serde_json::to_string_pretty(&config) {
                let _ = fs::write(&config_path, json);
            }
        }

        Self {
            current_activity: Arc::new(Mutex::new(None)),
            config: Arc::new(Mutex::new(config)),
        }
    }

    pub fn update_patterns(&self, patterns: Vec<String>) {
        let mut config = self.config.lock().unwrap();
        config.ticket_patterns = patterns;
        
        // Save to config.json
        let config_path = config.storage_dir.join("config.json");
         if let Ok(json) = serde_json::to_string_pretty(&*config) {
            let _ = fs::write(&config_path, json);
        }
    }

    pub fn get_patterns(&self) -> Vec<String> {
        self.config.lock().unwrap().ticket_patterns.clone()
    }

    pub fn check_activity(&self) {
        let window_result = get_active_window();
        
        let now = Local::now();

        match window_result {
            Ok(window) => {
                let app_name = window.app_name;
                let title = window.title;
                
                // Identify Ticket
                let (issue_id, identified_by) = self.identify_ticket(&app_name, &title);
                
                // DEBUG: Print to stdout so you can see what is being tracked in the terminal
                println!("Detected: App='{}', Title='{}' -> Ticket: {:?}", app_name, title, issue_id);
                
                let mut current_guard = self.current_activity.lock().unwrap();
                
                let mut should_switch = false;
                
                if let Some(current) = &*current_guard {
                    // Check if activity changed
                    // We consider it a change if:
                    // 1. App name changed
                    // 2. Detected Issue ID changed (and strictly if we moved from one issue to another, or from issue to none)
                    // Note: If title changes but Issue ID remains same (e.g. switching tabs on same ticket), we might want to keep it as one activity?
                    // The prompt says: "tracks open windows/tools/browser tabs." and "minimum length... is 5 minutes".
                    // If we strictly track every title change, we'll have many micro-entries.
                    // Strategy: Group by (AppName, IssueID). 
                    
                    if current.app_name != app_name || current.issue_id != issue_id {
                         should_switch = true;
                    }
                } else {
                    should_switch = true;
                }

                if should_switch {
                    // Close previous activity if it exists
                    if let Some(current) = current_guard.take() {
                        self.save_activity(current, now);
                    }
                    
                    // Start new activity
                    *current_guard = Some(CurrentActivity {
                        start_time: now,
                        app_name,
                        title,
                        issue_id,
                        identified_by,
                    });
                }
            },
            Err(_) => {
                // idle or error?
            }
        }
    }

    fn identify_ticket(&self, _app_name: &str, title: &str) -> (Option<String>, String) {
        let config = self.config.lock().unwrap();
        
        for pattern_str in &config.ticket_patterns {
            if let Ok(re) = Regex::new(pattern_str) {
                // Check title
                if let Some(caps) = re.captures(title) {
                    if let Some(m) = caps.get(1) {
                        return (Some(m.as_str().to_string()), "window_title".to_string()); // or tab_title, hard to distinguish without accessibility
                    }
                }
            }
        }
        
        // Fallback: Check git branch if it's a terminal?
        // For now, relying on title which often contains branch name in configured terminals
        
        (None, "none".to_string())
    }

    fn save_activity(&self, activity: CurrentActivity, end_time: DateTime<Local>) {
        let duration = end_time - activity.start_time;
        
        let is_first_entry = self.is_first_entry_of_day();
        
        if duration.num_minutes() >= 1 || is_first_entry {
             let item = ActivityItem {
                from: activity.start_time.format("%Y-%m-%d %H:%M:%S").to_string(),
                to: end_time.format("%Y-%m-%d %H:%M:%S").to_string(),
                application_name: activity.app_name,
                related_issue_id: activity.issue_id.clone(),
                category: if activity.issue_id.is_some() { "issue_related_activity".to_string() } else { "no_ticket_found".to_string() },
                issue_identified_by: if activity.issue_id.is_some() { activity.identified_by } else { "none".to_string() },
            };
            
            // Append to file
            self.append_to_file(item);
        }
    }
    
    fn is_first_entry_of_day(&self) -> bool {
        let config = self.config.lock().unwrap();
        let date_str = Local::now().format("%Y-%m-%d").to_string();
        let file_name = format!("activity_{}.json", date_str);
        let file_path = config.storage_dir.join(file_name);
        
        if !file_path.exists() {
            return true;
        }
        
        if let Ok(content) = fs::read_to_string(&file_path) {
             if let Ok(activities) = serde_json::from_str::<Vec<ActivityItem>>(&content) {
                 return activities.is_empty();
             }
        }
        
        true
    }
    
    fn append_to_file(&self, item: ActivityItem) {
        let config = self.config.lock().unwrap();
        let date_str = Local::now().format("%Y-%m-%d").to_string();
        let file_name = format!("activity_{}.json", date_str);
        let file_path = config.storage_dir.join(file_name);
        
        let mut activities: Vec<ActivityItem> = Vec::new();
        
        if file_path.exists() {
            if let Ok(content) = fs::read_to_string(&file_path) {
                if let Ok(parsed) = serde_json::from_str(&content) {
                    activities = parsed;
                }
            }
        }

        // Check if we can merge with the last activity
        if let Some(last_activity) = activities.last_mut() {
            // Try to parse "from" and "to" times of the last activity
            let fmt = "%Y-%m-%d %H:%M:%S";
            if let Ok(last_to) = NaiveDateTime::parse_from_str(&last_activity.to, fmt) {
                if let Ok(new_from) = NaiveDateTime::parse_from_str(&item.from, fmt) {
                    // Calculate gap duration
                    let gap = new_from - last_to;
                    
                    // If gap is less than or equal to 3 minutes AND it's the same activity type
                    if gap.num_minutes() <= 3 
                        && last_activity.application_name == item.application_name 
                        && last_activity.related_issue_id == item.related_issue_id 
                    {
                        // Merge: Update the "to" time of the last activity
                        last_activity.to = item.to;
                        
                        // Save updated list
                        if let Ok(json) = serde_json::to_string_pretty(&activities) {
                            let _ = fs::write(file_path, json);
                        }
                        return;
                    }
                }
            }
        }
        
        // If no merge happened, append new item
        activities.push(item);
        
        if let Ok(json) = serde_json::to_string_pretty(&activities) {
            let _ = fs::write(file_path, json);
        }
    }
    
    pub fn get_storage_dir(&self) -> PathBuf {
        self.config.lock().unwrap().storage_dir.clone()
    }
    
    pub fn get_current_status(&self) -> String {
        let guard = self.current_activity.lock().unwrap();
        if let Some(current) = &*guard {
             if let Some(id) = &current.issue_id {
                 return format!("Tracking: #{}", id);
             }
             return format!("Tracking: {}", current.app_name);
        }
        "Idle".to_string()
    }
}
